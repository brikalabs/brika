import { flatten, type TranslationData } from '@brika/i18n';
import type { KeyUsageMap } from './scan-usage';
import type { ValidationIssue } from './types';

// i18next plural suffixes. A code call `t('items', { count })` resolves at
// runtime to one of `items_one`, `items_other`, etc. — the static scanner
// only sees the bare `items`, so we treat the base key as satisfied when
// *any* suffixed variant exists in locales, and vice versa for dead-key
// detection.
const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'] as const;

function stripPluralSuffix(key: string): string | null {
  for (const suffix of PLURAL_SUFFIXES) {
    if (key.endsWith(suffix)) {
      return key.slice(0, -suffix.length);
    }
  }
  return null;
}

function splitQualifiedKey(qualifiedKey: string): { ns: string; key: string } | null {
  const colon = qualifiedKey.indexOf(':');
  if (colon <= 0 || colon === qualifiedKey.length - 1) {
    return null;
  }
  return { ns: qualifiedKey.slice(0, colon), key: qualifiedKey.slice(colon + 1) };
}

function buildLocaleKeySet(translations: Map<string, Map<string, TranslationData>>): Set<string> {
  const out = new Set<string>();
  for (const nsMap of translations.values()) {
    for (const [ns, data] of nsMap) {
      for (const flatKey of flatten(data).keys()) {
        out.add(`${ns}:${flatKey}`);
      }
    }
  }
  return out;
}

function codeKeyExistsInLocales(codeKey: string, localeKeys: Set<string>): boolean {
  if (localeKeys.has(codeKey)) {
    return true;
  }
  // A bare `items` call matches `items_one`/`items_other` plurals.
  for (const suffix of PLURAL_SUFFIXES) {
    if (localeKeys.has(`${codeKey}${suffix}`)) {
      return true;
    }
  }
  return false;
}

function localeKeyIsUsedInCode(qualifiedKey: string, codeKeys: Set<string>): boolean {
  if (codeKeys.has(qualifiedKey)) {
    return true;
  }
  // A locale `items_other` is satisfied by code calling `items`.
  const base = stripPluralSuffix(qualifiedKey);
  return base !== null && codeKeys.has(base);
}

export interface ValidateCodeUsageOptions {
  /**
   * Extra namespace prefixes to try when a code-reported qualified key isn't
   * found in the locale data directly. Brika's `tp(pluginId, key)` wrapper
   * prepends `'plugin:'` to the runtime namespace but the static scanner
   * doesn't know that convention — passing `['plugin:']` here makes the
   * validator try `${prefix}${ns}:${key}` as a fallback before flagging an
   * `unknown-key`. Default: `[]` (no prefix expansion).
   */
  readonly extraPrefixes?: ReadonlyArray<string>;
  /**
   * Skip `dead-key` reporting for locale keys whose namespace starts with one
   * of these prefixes. Useful when locale data includes namespaces served
   * from a runtime source the static scanner can't see (e.g. brika's
   * runtime-installed plugins land under `'plugin:'` but their source code
   * isn't in the workspace). Default: `[]`.
   */
  readonly deadKeyIgnoreNamespaces?: ReadonlyArray<string>;
  /** Severity for `unknown-key` issues. `'off'` skips the check entirely. Default `'error'`. */
  readonly unknownKeySeverity?: 'error' | 'warning' | 'off';
  /** Severity for `dead-key` issues. `'off'` skips the check entirely. Default `'warning'`. */
  readonly deadKeySeverity?: 'error' | 'warning' | 'off';
}

/**
 * Cross-validate the static-scanner's `t()` / `tp()` usage map against the
 * loaded locale data and emit two kinds of issue:
 *
 *   - `unknown-key`  — code references a key that doesn't exist in any
 *     locale under the namespace. Runtime would fall through to the
 *     default-value or missing-key handler.
 *   - `dead-key`     — a locale ships a key that no `t()` call references.
 *     Either stale or used via a dynamic template the scanner couldn't
 *     statically resolve.
 *
 * Plural suffixes (`_one`, `_other`, …) are treated as variants of their
 * base key: a code call `t('items')` is satisfied by `items_one`/`items_other`
 * in locales, and vice versa.
 *
 * Issues are reported against `referenceLocale` (it spans all locales — the
 * issue isn't per-locale-specific). Caller can filter or relabel.
 */
export function validateCodeUsage(
  translations: Map<string, Map<string, TranslationData>>,
  keyUsage: KeyUsageMap,
  referenceLocale: string,
  options: ValidateCodeUsageOptions = {}
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const localeKeys = buildLocaleKeySet(translations);
  const codeKeys = new Set(Object.keys(keyUsage.keys));
  const patterns = keyUsage.patterns;
  const opaqueNamespaces = keyUsage.opaqueNamespaces;
  const hasGlobalOpaque = keyUsage.hasGlobalOpaque;
  const extraPrefixes = options.extraPrefixes ?? [];
  const deadKeyIgnoreNamespaces = options.deadKeyIgnoreNamespaces ?? [];
  const unknownKeySeverity = options.unknownKeySeverity ?? 'error';
  const deadKeySeverity = options.deadKeySeverity ?? 'warning';

  if (unknownKeySeverity !== 'off') {
    collectUnknownKeyIssues(
      issues,
      codeKeys,
      localeKeys,
      extraPrefixes,
      referenceLocale,
      unknownKeySeverity
    );
  }
  // Dead-key suppression for opaque calls. A fully unscoped opaque (e.g.
  // `t(varName)`) means any key in any namespace could be referenced; we
  // can't prove anything is dead. Per-namespace opaque (`useTranslation('x')`
  // + `t(varName)`) makes everything under that namespace potentially used.
  if (deadKeySeverity !== 'off' && !hasGlobalOpaque) {
    collectDeadKeyIssues(issues, {
      localeKeys,
      codeKeys,
      patterns,
      opaqueNamespaces,
      extraPrefixes,
      deadKeyIgnoreNamespaces,
      referenceLocale,
      severity: deadKeySeverity,
    });
  }

  return issues;
}

function collectUnknownKeyIssues(
  issues: ValidationIssue[],
  codeKeys: Set<string>,
  localeKeys: Set<string>,
  extraPrefixes: ReadonlyArray<string>,
  referenceLocale: string,
  severity: 'error' | 'warning'
): void {
  for (const codeKey of codeKeys) {
    if (codeKeyExistsInLocales(codeKey, localeKeys)) {
      continue;
    }
    const matchedWithPrefix = extraPrefixes.some((prefix) =>
      codeKeyExistsInLocales(`${prefix}${codeKey}`, localeKeys)
    );
    if (matchedWithPrefix) {
      continue;
    }
    const split = splitQualifiedKey(codeKey);
    issues.push({
      type: 'unknown-key',
      severity,
      namespace: split?.ns ?? codeKey,
      locale: referenceLocale,
      key: split?.key ?? codeKey,
      referenceLocale,
    });
  }
}

interface DeadKeyContext {
  readonly localeKeys: Set<string>;
  readonly codeKeys: Set<string>;
  readonly patterns: ReadonlyArray<string>;
  readonly opaqueNamespaces: ReadonlyArray<string>;
  readonly extraPrefixes: ReadonlyArray<string>;
  readonly deadKeyIgnoreNamespaces: ReadonlyArray<string>;
  readonly referenceLocale: string;
  readonly severity: 'error' | 'warning';
}

function collectDeadKeyIssues(issues: ValidationIssue[], ctx: DeadKeyContext): void {
  for (const localeKey of ctx.localeKeys) {
    if (isLocaleKeySatisfied(localeKey, ctx)) {
      continue;
    }
    const split = splitQualifiedKey(localeKey);
    const namespace = split?.ns ?? localeKey;
    if (ctx.deadKeyIgnoreNamespaces.some((prefix) => namespace.startsWith(prefix))) {
      continue;
    }
    issues.push({
      type: 'dead-key',
      severity: ctx.severity,
      namespace,
      locale: ctx.referenceLocale,
      key: split?.key ?? localeKey,
      referenceLocale: ctx.referenceLocale,
    });
  }
}

/**
 * A locale key is considered "satisfied" (i.e. NOT dead) when any of:
 *   - an exact code call references it;
 *   - a template-literal prefix from the scan covers it;
 *   - an opaque dynamic call exists in its namespace context;
 *   - one of `extraPrefixes` strips to a known code call (host-side prefix
 *     conventions like brika's `plugin:`).
 */
function isLocaleKeySatisfied(localeKey: string, ctx: DeadKeyContext): boolean {
  if (localeKeyIsUsedInCode(localeKey, ctx.codeKeys)) {
    return true;
  }
  if (ctx.patterns.some((prefix) => localeKey.startsWith(prefix))) {
    return true;
  }
  const ns = splitQualifiedKey(localeKey)?.ns;
  if (ns && ctx.opaqueNamespaces.includes(ns)) {
    return true;
  }
  return ctx.extraPrefixes.some((prefix) => isSatisfiedAfterPrefixStrip(localeKey, prefix, ctx));
}

function isSatisfiedAfterPrefixStrip(
  localeKey: string,
  prefix: string,
  ctx: DeadKeyContext
): boolean {
  if (!localeKey.startsWith(prefix)) {
    return false;
  }
  const stripped = localeKey.slice(prefix.length);
  if (localeKeyIsUsedInCode(stripped, ctx.codeKeys)) {
    return true;
  }
  if (ctx.patterns.some((p) => stripped.startsWith(p))) {
    return true;
  }
  const strippedNs = splitQualifiedKey(stripped)?.ns;
  return Boolean(strippedNs && ctx.opaqueNamespaces.includes(strippedNs));
}
