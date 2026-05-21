import { flatten, getNestedValue, type TranslationData } from '@brika/i18n';
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

// ─── Namespace-level validation ────────────────────────────────────────────

interface NsContext {
  ns: string;
  locale: string;
  referenceLocale: string;
  refNsData: TranslationData;
  targetData: TranslationData;
  refKeys: string[];
  targetKeySet: Set<string>;
}

function buildNsContext(
  ns: string,
  locale: string,
  referenceLocale: string,
  refNsData: TranslationData,
  targetData: TranslationData
): NsContext {
  return {
    ns,
    locale,
    referenceLocale,
    refNsData,
    targetData,
    refKeys: extractKeys(refNsData),
    targetKeySet: new Set(extractKeys(targetData)),
  };
}

function validateKeyParity(ctx: NsContext, issues: ValidationIssue[]) {
  const refKeySet = new Set(ctx.refKeys);

  for (const key of ctx.refKeys) {
    if (!ctx.targetKeySet.has(key)) {
      issues.push({
        type: 'missing-key',
        severity: 'error',
        namespace: ctx.ns,
        locale: ctx.locale,
        key,
        referenceLocale: ctx.referenceLocale,
      });
    }
  }

  for (const key of ctx.targetKeySet) {
    if (!refKeySet.has(key)) {
      issues.push({
        type: 'extra-key',
        severity: 'warning',
        namespace: ctx.ns,
        locale: ctx.locale,
        key,
        referenceLocale: ctx.referenceLocale,
      });
    }
  }
}

function validateVariableParity(ctx: NsContext, issues: ValidationIssue[]) {
  for (const key of ctx.refKeys) {
    if (!ctx.targetKeySet.has(key)) {
      continue;
    }
    const refVal = getNestedValue(ctx.refNsData, key);
    const tgtVal = getNestedValue(ctx.targetData, key);
    if (typeof refVal !== 'string' || typeof tgtVal !== 'string') {
      continue;
    }
    const refVars = new Set(extractVariables(refVal));
    if (refVars.size === 0) {
      continue;
    }
    const tgtVars = new Set(extractVariables(tgtVal));
    const missing = [...refVars].filter((v) => !tgtVars.has(v));
    if (missing.length > 0) {
      issues.push({
        type: 'missing-variable',
        severity: 'warning',
        namespace: ctx.ns,
        locale: ctx.locale,
        key,
        referenceLocale: ctx.referenceLocale,
        variables: missing,
      });
    }
  }
}

function computeCoverage(ctx: NsContext): CoverageEntry {
  const translated = ctx.refKeys.filter((k) => ctx.targetKeySet.has(k)).length;
  return {
    locale: ctx.locale,
    namespace: ctx.ns,
    totalKeys: ctx.refKeys.length,
    translatedKeys: translated,
    percentage: ctx.refKeys.length > 0 ? Math.round((translated / ctx.refKeys.length) * 100) : 100,
  };
}

// ─── Main entry ────────────────────────────────────────────────────────────

/**
 * Validate translation key parity across locales and compute coverage.
 *
 * @param translations Map of `locale → namespace → translationData`
 * @param referenceLocale The locale used as ground truth (e.g. `"en"`)
 */
export function validateLocales(
  translations: Map<string, Map<string, TranslationData>>,
  referenceLocale: string
): { issues: ValidationIssue[]; coverage: CoverageEntry[] } {
  const issues: ValidationIssue[] = [];
  const coverage: CoverageEntry[] = [];

  const refData = translations.get(referenceLocale);
  if (!refData) {
    return { issues, coverage };
  }

  // Reference locale coverage is always 100% by definition.
  for (const [ns, refNsData] of refData) {
    const refKeys = extractKeys(refNsData);
    coverage.push({
      locale: referenceLocale,
      namespace: ns,
      totalKeys: refKeys.length,
      translatedKeys: refKeys.length,
      percentage: 100,
    });
  }

  for (const [locale, namespaces] of translations) {
    if (locale === referenceLocale) {
      continue;
    }

    for (const [ns, refNsData] of refData) {
      const targetData = namespaces.get(ns);
      if (!targetData) {
        issues.push({
          type: 'missing-namespace',
          severity: 'error',
          namespace: ns,
          locale,
          referenceLocale,
        });
        const refKeys = extractKeys(refNsData);
        coverage.push({
          locale,
          namespace: ns,
          totalKeys: refKeys.length,
          translatedKeys: 0,
          percentage: 0,
        });
        continue;
      }

      const ctx = buildNsContext(ns, locale, referenceLocale, refNsData, targetData);
      validateKeyParity(ctx, issues);
      validateVariableParity(ctx, issues);
      coverage.push(computeCoverage(ctx));
    }

    // Detect extra namespaces in the target that don't exist in reference.
    for (const ns of namespaces.keys()) {
      if (!refData.has(ns)) {
        issues.push({
          type: 'extra-key',
          severity: 'warning',
          namespace: ns,
          locale,
          referenceLocale,
        });
      }
    }
  }

  return { issues, coverage };
}
