import { describe, expect, test } from 'bun:test';
import { extractKeys, extractVariables, validateLocales } from './validate';

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

// ─── validateLocales ───────────────────────────────────────────────────────

describe('validateLocales', () => {
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

  test('reports no issues when translations match', () => {
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

  test('detects missing keys', () => {
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

  test('detects extra keys', () => {
    const translations = makeTranslations({
      en: { common: { hello: 'Hello' } },
      fr: { common: { hello: 'Bonjour', extra: 'Supplément' } },
    });
    const { issues } = validateLocales(translations, 'en');
    const extra = issues.filter((i) => i.type === 'extra-key');
    expect(extra).toHaveLength(1);
    expect(extra[0]?.key).toBe('extra');
  });

  test('detects missing namespace', () => {
    const translations = makeTranslations({
      en: { common: { hello: 'Hello' } },
      fr: {},
    });
    // fr has no 'common' namespace at all
    const frMap = translations.get('fr');
    if (frMap) {
      frMap.delete('common');
    }
    const { issues } = validateLocales(translations, 'en');
    const missing = issues.filter((i) => i.type === 'missing-namespace');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.namespace).toBe('common');
  });

  test('detects missing variables', () => {
    const translations = makeTranslations({
      en: { common: { greeting: 'Hello {{name}}, welcome to {{app}}' } },
      fr: { common: { greeting: 'Bonjour {{name}}' } },
    });
    const { issues } = validateLocales(translations, 'en');
    const missingVars = issues.filter((i) => i.type === 'missing-variable');
    expect(missingVars).toHaveLength(1);
    expect(missingVars[0]?.variables).toEqual(['app']);
  });

  test('computes coverage percentage', () => {
    const translations = makeTranslations({
      en: { common: { a: '1', b: '2', c: '3', d: '4' } },
      fr: { common: { a: '1', b: '2', c: '3' } },
    });
    const { coverage } = validateLocales(translations, 'en');
    expect(coverage).toHaveLength(2);
    const frCoverage = coverage.find((c) => c.locale === 'fr');
    expect(frCoverage?.percentage).toBe(75);
    expect(frCoverage?.translatedKeys).toBe(3);
    expect(frCoverage?.totalKeys).toBe(4);
  });

  test('returns empty when reference locale is missing', () => {
    const translations = makeTranslations({
      fr: { common: { hello: 'Bonjour' } },
    });
    const { issues, coverage } = validateLocales(translations, 'en');
    expect(issues).toEqual([]);
    expect(coverage).toEqual([]);
  });

  test('detects extra namespaces in target', () => {
    const translations = makeTranslations({
      en: { common: { hello: 'Hello' } },
      fr: { common: { hello: 'Bonjour' }, extra_ns: { key: 'val' } },
    });
    const { issues } = validateLocales(translations, 'en');
    const extra = issues.filter((i) => i.type === 'extra-key' && i.namespace === 'extra_ns');
    expect(extra).toHaveLength(1);
    expect(extra[0]?.locale).toBe('fr');
  });

  test('handles multiple locales', () => {
    const translations = makeTranslations({
      en: { common: { hello: 'Hello', bye: 'Bye' } },
      fr: { common: { hello: 'Bonjour' } },
      de: { common: { hello: 'Hallo', bye: 'Tschüss' } },
    });
    const { issues, coverage } = validateLocales(translations, 'en');
    const frMissing = issues.filter((i) => i.locale === 'fr' && i.type === 'missing-key');
    expect(frMissing).toHaveLength(1);
    const deMissing = issues.filter((i) => i.locale === 'de' && i.type === 'missing-key');
    expect(deMissing).toHaveLength(0);
    expect(coverage.filter((c) => c.locale === 'de')[0]?.percentage).toBe(100);
    expect(coverage.filter((c) => c.locale === 'fr')[0]?.percentage).toBe(50);
  });

  test('handles nested translation keys', () => {
    const translations = makeTranslations({
      en: { common: { nav: { home: 'Home', settings: 'Settings' } } },
      fr: { common: { nav: { home: 'Accueil' } } },
    });
    const { issues } = validateLocales(translations, 'en');
    const missing = issues.filter((i) => i.type === 'missing-key');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.key).toBe('nav.settings');
  });
});
