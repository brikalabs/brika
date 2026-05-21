import { flatten, type TranslationData } from '@brika/i18n';
import type { KeyUsageMap } from './scan-usage';
import type { CoverageEntry, ValidationIssue } from './types';

/** Extract `{{var}}` interpolation variable names from a translation string. */
export function extractVariables(value: string): string[] {
  const vars: string[] = [];
  let from = 0;
  for (;;) {
    const open = value.indexOf('{{', from);
    if (open === -1) {
      break;
    }
    const close = value.indexOf('}}', open + 2);
    if (close === -1) {
      break;
    }
    const name = value.slice(open + 2, close).trim();
    if (name.length > 0) {
      vars.push(name);
    }
    from = close + 2;
  }
  return vars;
}

/**
 * Sorted list of leaf key paths inside a translation tree. Thin wrapper over
 * `@brika/i18n#flatten` that returns the sorted dotted paths.
 */
export function extractKeys(obj: TranslationData): string[] {
  const flat = flatten(obj);
  const keys = [...flat.keys()];
  keys.sort((a, b) => a.localeCompare(b));
  return keys;
}

// ─── Union-based validation ────────────────────────────────────────────────

/**
 * Build the per-namespace union of locale flat-key maps. Every locale present
 * in `translations` is registered for every namespace, even when its
 * `nsMap.get(ns)` is undefined — that way downstream code can treat "absent
 * namespace" as a first-class case (→ `missing-namespace` issue) without
 * special-casing the outer iteration.
 */
function indexByNamespace(
  translations: Map<string, Map<string, TranslationData>>
): Map<string, Map<string, Map<string, unknown> | undefined>> {
  const allNamespaces = new Set<string>();
  for (const nsMap of translations.values()) {
    for (const ns of nsMap.keys()) {
      allNamespaces.add(ns);
    }
  }

  const byNamespace = new Map<string, Map<string, Map<string, unknown> | undefined>>();
  for (const ns of allNamespaces) {
    const perLocale = new Map<string, Map<string, unknown> | undefined>();
    for (const [locale, nsMap] of translations) {
      const data = nsMap.get(ns);
      perLocale.set(locale, data ? flatten(data) : undefined);
    }
    byNamespace.set(ns, perLocale);
  }

  return byNamespace;
}

function unionOfKeys(perLocale: Map<string, Map<string, unknown> | undefined>): Set<string> {
  const out = new Set<string>();
  for (const flat of perLocale.values()) {
    if (!flat) {
      continue;
    }
    for (const k of flat.keys()) {
      out.add(k);
    }
  }
  return out;
}

function pushMissingNamespace(
  issues: ValidationIssue[],
  coverage: CoverageEntry[],
  ns: string,
  locale: string,
  referenceLocale: string,
  unionKeySize: number
): void {
  issues.push({
    type: 'missing-namespace',
    severity: 'error',
    namespace: ns,
    locale,
    referenceLocale,
  });
  coverage.push({
    locale,
    namespace: ns,
    totalKeys: unionKeySize,
    translatedKeys: 0,
    percentage: unionKeySize === 0 ? 100 : 0,
  });
}

function pushKeyParity(
  issues: ValidationIssue[],
  ns: string,
  locale: string,
  referenceLocale: string,
  flat: Map<string, unknown>,
  unionKeys: Set<string>
): void {
  for (const key of unionKeys) {
    if (!flat.has(key)) {
      issues.push({
        type: 'missing-key',
        severity: 'error',
        namespace: ns,
        locale,
        key,
        referenceLocale,
      });
    }
  }
}

function pushCoverage(
  coverage: CoverageEntry[],
  ns: string,
  locale: string,
  flat: Map<string, unknown>,
  unionKeySize: number
): void {
  const translated = unionKeySize === 0 ? 0 : flat.size;
  coverage.push({
    locale,
    namespace: ns,
    totalKeys: unionKeySize,
    translatedKeys: translated,
    percentage: unionKeySize === 0 ? 100 : Math.round((translated / unionKeySize) * 100),
  });
}

function unionVariablesFor(
  key: string,
  perLocale: Map<string, Map<string, unknown> | undefined>
): Set<string> {
  const out = new Set<string>();
  for (const flat of perLocale.values()) {
    if (!flat) {
      continue;
    }
    const v = flat.get(key);
    if (typeof v === 'string') {
      for (const name of extractVariables(v)) {
        out.add(name);
      }
    }
  }
  return out;
}

function diffVariables(value: string, allVars: Set<string>): string[] {
  const locVars = new Set(extractVariables(value));
  return [...allVars].filter((name) => !locVars.has(name));
}

function pushVariableParity(
  issues: ValidationIssue[],
  ns: string,
  referenceLocale: string,
  perLocale: Map<string, Map<string, unknown> | undefined>,
  unionKeys: Set<string>
): void {
  for (const key of unionKeys) {
    const allVars = unionVariablesFor(key, perLocale);
    if (allVars.size === 0) {
      continue;
    }
    for (const [locale, flat] of perLocale) {
      const v = flat?.get(key);
      if (typeof v !== 'string') {
        continue;
      }
      const missing = diffVariables(v, allVars);
      if (missing.length === 0) {
        continue;
      }
      issues.push({
        type: 'missing-variable',
        severity: 'warning',
        namespace: ns,
        locale,
        key,
        referenceLocale,
        variables: missing,
      });
    }
  }
}

// ─── Main entry ────────────────────────────────────────────────────────────

/**
 * Validate translation parity across locales using union semantics.
 *
 * The total per namespace is the union of leaf keys across **every** locale —
 * no locale is privileged as ground truth. Every locale that lacks a key
 * present elsewhere emits a `missing-key` issue (errors). Variable parity is
 * checked against the union of `{{var}}` names across all locales that define
 * the key as a string.
 *
 * `referenceLocale` is preserved as a label on each issue so the overlay can
 * show a primary-display value, but it has no effect on validation outcomes.
 *
 * @param translations Map of `locale → namespace → translationData`
 * @param referenceLocale Label attached to issues; does not gate validation.
 */
export function validateLocales(
  translations: Map<string, Map<string, TranslationData>>,
  referenceLocale: string
): { issues: ValidationIssue[]; coverage: CoverageEntry[] } {
  const issues: ValidationIssue[] = [];
  const coverage: CoverageEntry[] = [];

  if (translations.size === 0) {
    return { issues, coverage };
  }

  const byNamespace = indexByNamespace(translations);

  for (const [ns, perLocale] of byNamespace) {
    const unionKeys = unionOfKeys(perLocale);

    for (const [locale, flat] of perLocale) {
      if (!flat) {
        pushMissingNamespace(issues, coverage, ns, locale, referenceLocale, unionKeys.size);
        continue;
      }
      pushKeyParity(issues, ns, locale, referenceLocale, flat, unionKeys);
      pushCoverage(coverage, ns, locale, flat, unionKeys.size);
    }

    pushVariableParity(issues, ns, referenceLocale, perLocale, unionKeys);
  }

  return { issues, coverage };
}

// ─── Code ↔ locale cross-validation ────────────────────────────────────────

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
