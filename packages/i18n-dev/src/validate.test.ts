import { describe, expect, test } from 'bun:test';
import type { KeyUsageMap } from './scan-usage';
import { extractKeys, extractVariables, validateCodeUsage, validateLocales } from './validate';

// ─── extractVariables ──────────────────────────────────────────────────────

describe('extractVariables', () => {
  test('returns empty array for plain string', () => {
    expect(extractVariables('Hello world')).toEqual([]);
  });

  test('extracts single variable', () => {
    expect(extractVariables('Hello {{name}}')).toEqual(['name']);
  });

  test('extracts multiple variables', () => {
    expect(extractVariables('{{greeting}} {{name}}, you have {{count}} messages')).toEqual([
      'greeting',
      'name',
      'count',
    ]);
  });

  test('trims whitespace inside braces', () => {
    expect(extractVariables('{{ name }}')).toEqual(['name']);
  });

  test('ignores empty braces', () => {
    expect(extractVariables('{{}} text')).toEqual([]);
  });

  test('ignores unclosed braces', () => {
    expect(extractVariables('{{name')).toEqual([]);
  });
});

// ─── extractKeys ───────────────────────────────────────────────────────────

describe('extractKeys', () => {
  test('returns leaf keys from flat object', () => {
    expect(extractKeys({ a: 'x', b: 'y' })).toEqual(['a', 'b']);
  });

  test('returns dot-separated keys from nested object', () => {
    expect(extractKeys({ a: { b: 'x', c: 'y' }, d: 'z' })).toEqual(['a.b', 'a.c', 'd']);
  });

  test('handles deeply nested objects', () => {
    expect(extractKeys({ a: { b: { c: 'deep' } } })).toEqual(['a.b.c']);
  });

  test('returns empty array for empty object', () => {
    expect(extractKeys({})).toEqual([]);
  });

  test('treats arrays as leaf values', () => {
    expect(extractKeys({ items: ['a', 'b'] })).toEqual(['items']);
  });

  test('treats null as leaf value', () => {
    expect(extractKeys({ key: null as unknown })).toEqual(['key']);
  });

  test('sorts keys alphabetically', () => {
    expect(extractKeys({ z: '1', a: '2', m: '3' })).toEqual(['a', 'm', 'z']);
  });
});

// ─── validateLocales (union semantics) ─────────────────────────────────────

function makeTranslations(
  data: Record<string, Record<string, Record<string, unknown>>>
): Map<string, Map<string, Record<string, unknown>>> {
  const map = new Map<string, Map<string, Record<string, unknown>>>();
  for (const [locale, namespaces] of Object.entries(data)) {
    const nsMap = new Map<string, Record<string, unknown>>();
    for (const [ns, content] of Object.entries(namespaces)) {
      nsMap.set(ns, content);
    }
    map.set(locale, nsMap);
  }
  return map;
}

describe('validateLocales', () => {
  test('reports no issues when every locale has the same keys', () => {
    const translations = makeTranslations({
      en: { common: { hello: 'Hello', bye: 'Goodbye' } },
      fr: { common: { hello: 'Bonjour', bye: 'Au revoir' } },
    });
    const { issues, coverage } = validateLocales(translations, 'en');
    expect(issues).toEqual([]);
    expect(coverage).toEqual([
      { locale: 'en', namespace: 'common', totalKeys: 2, translatedKeys: 2, percentage: 100 },
      { locale: 'fr', namespace: 'common', totalKeys: 2, translatedKeys: 2, percentage: 100 },
    ]);
  });

  test('flags a key missing in one locale even if reference has it', () => {
    const translations = makeTranslations({
      en: { common: { hello: 'Hello', bye: 'Goodbye' } },
      fr: { common: { hello: 'Bonjour' } },
    });
    const { issues } = validateLocales(translations, 'en');
    const missing = issues.filter((i) => i.type === 'missing-key');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.key).toBe('bye');
    expect(missing[0]?.locale).toBe('fr');
  });

  test('flags a key present only in a non-reference locale as missing in reference', () => {
    const translations = makeTranslations({
      en: { common: { hello: 'Hello' } },
      fr: { common: { hello: 'Bonjour', extra: 'Supplément' } },
    });
    const { issues } = validateLocales(translations, 'en');
    const missing = issues.filter((i) => i.type === 'missing-key');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.key).toBe('extra');
    expect(missing[0]?.locale).toBe('en');
  });

  test('reports missing-namespace per locale that lacks a namespace', () => {
    const translations = makeTranslations({
      en: { common: { hello: 'Hello' } },
      fr: {},
    });
    const frMap = translations.get('fr');
    if (frMap) {
      frMap.delete('common');
    }
    const { issues } = validateLocales(translations, 'en');
    const missing = issues.filter((i) => i.type === 'missing-namespace');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.namespace).toBe('common');
    expect(missing[0]?.locale).toBe('fr');
  });

  test('flags variable mismatch symmetrically against the union of variables', () => {
    const translations = makeTranslations({
      en: { common: { greeting: 'Hello {{name}}, welcome to {{app}}' } },
      fr: { common: { greeting: 'Bonjour {{name}}' } },
    });
    const { issues } = validateLocales(translations, 'en');
    const missingVars = issues.filter((i) => i.type === 'missing-variable');
    expect(missingVars).toHaveLength(1);
    expect(missingVars[0]?.locale).toBe('fr');
    expect(missingVars[0]?.variables).toEqual(['app']);
  });

  test('coverage percentage uses the union of all keys as the denominator', () => {
    const translations = makeTranslations({
      en: { common: { a: '1', b: '2', c: '3', d: '4' } },
      fr: { common: { a: '1', b: '2', c: '3' } },
    });
    const { coverage } = validateLocales(translations, 'en');
    expect(coverage).toHaveLength(2);
    const enCoverage = coverage.find((c) => c.locale === 'en');
    const frCoverage = coverage.find((c) => c.locale === 'fr');
    expect(enCoverage?.totalKeys).toBe(4);
    expect(enCoverage?.percentage).toBe(100);
    expect(frCoverage?.totalKeys).toBe(4);
    expect(frCoverage?.translatedKeys).toBe(3);
    expect(frCoverage?.percentage).toBe(75);
  });

  test('returns empty when no locales are present', () => {
    const translations = makeTranslations({});
    const { issues, coverage } = validateLocales(translations, 'en');
    expect(issues).toEqual([]);
    expect(coverage).toEqual([]);
  });

  test('single-locale input has zero issues — nothing to compare against', () => {
    const translations = makeTranslations({
      fr: { common: { hello: 'Bonjour' } },
    });
    const { issues, coverage } = validateLocales(translations, 'en');
    expect(issues).toEqual([]);
    expect(coverage).toEqual([
      { locale: 'fr', namespace: 'common', totalKeys: 1, translatedKeys: 1, percentage: 100 },
    ]);
  });

  test('a namespace present in only one locale triggers missing-namespace in all others', () => {
    const translations = makeTranslations({
      en: { common: { hello: 'Hello' } },
      fr: { common: { hello: 'Bonjour' }, extra_ns: { key: 'val' } },
    });
    const { issues } = validateLocales(translations, 'en');
    const nsMissing = issues.filter(
      (i) => i.type === 'missing-namespace' && i.namespace === 'extra_ns'
    );
    expect(nsMissing).toHaveLength(1);
    expect(nsMissing[0]?.locale).toBe('en');
  });

  test('three locales: each missing key surfaces for the locale that lacks it', () => {
    const translations = makeTranslations({
      en: { common: { hello: 'Hello', bye: 'Bye' } },
      fr: { common: { hello: 'Bonjour' } },
      de: { common: { hello: 'Hallo', bye: 'Tschüss' } },
    });
    const { issues, coverage } = validateLocales(translations, 'en');
    const frMissing = issues.filter((i) => i.locale === 'fr' && i.type === 'missing-key');
    expect(frMissing).toHaveLength(1);
    expect(frMissing[0]?.key).toBe('bye');

    expect(coverage.find((c) => c.locale === 'en')?.percentage).toBe(100);
    expect(coverage.find((c) => c.locale === 'de')?.percentage).toBe(100);
    expect(coverage.find((c) => c.locale === 'fr')?.percentage).toBe(50);
  });

  test('nested translation keys flatten before union comparison', () => {
    const translations = makeTranslations({
      en: { common: { nav: { home: 'Home', settings: 'Settings' } } },
      fr: { common: { nav: { home: 'Accueil' } } },
    });
    const { issues } = validateLocales(translations, 'en');
    const missing = issues.filter((i) => i.type === 'missing-key');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.key).toBe('nav.settings');
    expect(missing[0]?.locale).toBe('fr');
  });

  test('issue.referenceLocale carries the configured label without affecting validation', () => {
    const translations = makeTranslations({
      en: { common: { a: '1' } },
      fr: { common: {} },
    });
    const { issues } = validateLocales(translations, 'de');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.referenceLocale).toBe('de');
    expect(issues[0]?.type).toBe('missing-key');
  });
});

// ─── validateCodeUsage ─────────────────────────────────────────────────────

function makeUsage(
  qualifiedKeys: string[],
  extras: Partial<Omit<KeyUsageMap, 'keys'>> = {}
): KeyUsageMap {
  const keys: Record<string, Array<{ file: string; line: number }>> = {};
  for (const key of qualifiedKeys) {
    keys[key] = [{ file: 'src/app.tsx', line: 1 }];
  }
  return {
    keys,
    patterns: extras.patterns ?? [],
    opaqueNamespaces: extras.opaqueNamespaces ?? [],
    hasGlobalOpaque: extras.hasGlobalOpaque ?? false,
  };
}

describe('validateCodeUsage', () => {
  test('flags code keys absent from any locale as unknown-key (error)', () => {
    const translations = makeTranslations({
      en: { common: { hello: 'Hello' } },
      fr: { common: { hello: 'Bonjour' } },
    });
    const usage = makeUsage(['common:hello', 'common:nonexistent']);

    const issues = validateCodeUsage(translations, usage, 'en');

    const unknown = issues.filter((i) => i.type === 'unknown-key');
    expect(unknown).toHaveLength(1);
    expect(unknown[0]?.key).toBe('nonexistent');
    expect(unknown[0]?.namespace).toBe('common');
    expect(unknown[0]?.severity).toBe('error');
  });

  test('flags locale keys never referenced in code as dead-key (warning)', () => {
    const translations = makeTranslations({
      en: { common: { hello: 'Hello', unused: 'Stale' } },
      fr: { common: { hello: 'Bonjour', unused: 'Stale' } },
    });
    const usage = makeUsage(['common:hello']);

    const issues = validateCodeUsage(translations, usage, 'en');

    const dead = issues.filter((i) => i.type === 'dead-key');
    expect(dead).toHaveLength(1);
    expect(dead[0]?.key).toBe('unused');
    expect(dead[0]?.severity).toBe('warning');
  });

  test('plural variants in locales satisfy a bare code key', () => {
    const translations = makeTranslations({
      en: { common: { items_one: '{{count}} item', items_other: '{{count}} items' } },
    });
    const usage = makeUsage(['common:items']);

    const issues = validateCodeUsage(translations, usage, 'en');

    // `items` is the code key; `items_one`/`items_other` cover it.
    expect(issues.filter((i) => i.type === 'unknown-key')).toHaveLength(0);
    // Neither plural variant is dead — the base call resolves them at runtime.
    expect(issues.filter((i) => i.type === 'dead-key')).toHaveLength(0);
  });

  test('extraPrefixes lets brika-style tp() calls match plugin: namespaces', () => {
    const translations = makeTranslations({
      en: {
        'plugin:@brika/plugin-weather': { 'stats.feelsLike': 'Feels like {{value}}' },
      },
    });
    const usage = makeUsage(['@brika/plugin-weather:stats.feelsLike']);

    const issuesWithoutPrefix = validateCodeUsage(translations, usage, 'en');
    const issuesWithPrefix = validateCodeUsage(translations, usage, 'en', {
      extraPrefixes: ['plugin:'],
    });

    expect(issuesWithoutPrefix.some((i) => i.type === 'unknown-key')).toBe(true);
    expect(issuesWithPrefix.some((i) => i.type === 'unknown-key')).toBe(false);
    expect(issuesWithPrefix.some((i) => i.type === 'dead-key')).toBe(false);
  });

  test('issues are anchored to the reference locale for grouping', () => {
    const translations = makeTranslations({
      en: { common: { hello: 'Hello' } },
      fr: { common: { hello: 'Bonjour' } },
    });
    const usage = makeUsage(['common:typo']);

    const issues = validateCodeUsage(translations, usage, 'de');

    expect(issues[0]?.locale).toBe('de');
    expect(issues[0]?.referenceLocale).toBe('de');
  });

  test('nested dotted code keys match nested locale keys', () => {
    const translations = makeTranslations({
      en: { auth: { password: { rules: { minLength: 'At least 8 chars' } } } },
    });
    const usage = makeUsage(['auth:password.rules.minLength', 'auth:password.rules.bogus']);

    const issues = validateCodeUsage(translations, usage, 'en');

    const unknown = issues.filter((i) => i.type === 'unknown-key');
    expect(unknown).toHaveLength(1);
    expect(unknown[0]?.key).toBe('password.rules.bogus');
  });

  test('empty inputs produce zero issues', () => {
    const issues = validateCodeUsage(new Map(), makeUsage([]), 'en');
    expect(issues).toEqual([]);
  });

  // ── New: dynamic-pattern + opaque-call accuracy guarantees ──────────────

  test('template-literal prefix from scanner satisfies all matching locale keys', () => {
    const translations = makeTranslations({
      en: {
        auth: { password: { rules: { minLength: 'A', uppercase: 'B', number: 'C' } } },
      },
    });
    // Scanner saw `t(`auth:password.rules.${rule.key}`)` — emits prefix.
    const usage = makeUsage([], { patterns: ['auth:password.rules.'] });

    const issues = validateCodeUsage(translations, usage, 'en');

    // No dead-key warnings: the three locale keys are all "potentially used"
    // by the dynamic call.
    expect(issues.filter((i) => i.type === 'dead-key')).toHaveLength(0);
  });

  test('opaque namespace suppresses dead-key for that namespace only', () => {
    const translations = makeTranslations({
      en: {
        auth: { hello: 'Hi', loggingOut: 'Out' },
        common: { unused: 'Stale' }, // genuinely dead
      },
    });
    // `useTranslation('auth')` + `t(varName)` → opaque namespace 'auth'.
    const usage = makeUsage([], { opaqueNamespaces: ['auth'] });

    const issues = validateCodeUsage(translations, usage, 'en');

    const dead = issues.filter((i) => i.type === 'dead-key');
    // auth:* are conservatively considered used; common:unused is still dead.
    expect(dead.map((i) => i.key)).toEqual(['unused']);
  });

  test('global opaque disables dead-key reporting entirely', () => {
    const translations = makeTranslations({
      en: { common: { unused: 'Stale', also_unused: 'Stale too' } },
    });
    // Bare `t(varName)` with no `useTranslation` → global opaque.
    const usage = makeUsage([], { hasGlobalOpaque: true });

    const issues = validateCodeUsage(translations, usage, 'en');

    expect(issues.filter((i) => i.type === 'dead-key')).toHaveLength(0);
  });
});
