import { flatten, type TranslationData } from '@brika/i18n';
import { extractVariables } from './extract';
import type { CoverageEntry, ValidationIssue } from './types';

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
