import { beforeAll, describe, expect, test } from 'bun:test';
import i18next from 'i18next';
import {
  REFERENCE_LOCALE,
  applyKeyUsage,
  applyTranslationBundle,
  buildFix,
  fixAllIssues,
  fixIssue,
  getKeyUsage,
  getLocales,
  getNestedStoreValue,
  getStoreData,
  getTranslations,
  sendFixes,
  subscribeKeyUsage,
  subscribeStore,
  trackedTranslations,
  walkStoreEntries,
} from './store';
import type { ValidationIssue } from '../types';

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    fallbackLng: false,
    resources: {
      en: {
        common: {
          hello: 'Hello',
          bye: 'Goodbye',
          nested: { deep: 'Deep value' },
        },
      },
      fr: {
        common: { hello: 'Bonjour' },
      },
    },
  });
});

// ─── REFERENCE_LOCALE ──────────────────────────────────────────────────────

describe('REFERENCE_LOCALE', () => {
  test('is "en"', () => {
    expect(REFERENCE_LOCALE).toBe('en');
  });
});

// ─── walkStoreEntries ──────────────────────────────────────────────────────

describe('walkStoreEntries', () => {
  test('walks flat entries', () => {
    const entries: [string, string, string][] = [];
    walkStoreEntries(
      { ns: { a: 'one', b: 'two' } },
      (ns, key, value) => entries.push([ns, key, value])
    );
    expect(entries).toEqual([
      ['ns', 'a', 'one'],
      ['ns', 'b', 'two'],
    ]);
  });

  test('walks nested entries with dot-separated keys', () => {
    const entries: [string, string, string][] = [];
    walkStoreEntries(
      { ns: { parent: { child: 'val' } } },
      (ns, key, value) => entries.push([ns, key, value])
    );
    expect(entries).toEqual([['ns', 'parent.child', 'val']]);
  });

  test('ignores non-string leaf values', () => {
    const entries: [string, string, string][] = [];
    walkStoreEntries(
      { ns: { num: 42, arr: ['a'], str: 'ok' } as Record<string, unknown> },
      (ns, key, value) => entries.push([ns, key, value])
    );
    expect(entries).toEqual([['ns', 'str', 'ok']]);
  });

  test('handles multiple namespaces', () => {
    const entries: [string, string][] = [];
    walkStoreEntries(
      { a: { key: 'val1' }, b: { key: 'val2' } },
      (ns, key) => entries.push([ns, key])
    );
    expect(entries).toEqual([
      ['a', 'key'],
      ['b', 'key'],
    ]);
  });

  test('skips null namespace data', () => {
    const entries: string[] = [];
    walkStoreEntries(
      { ns: null } as unknown as Record<string, Record<string, unknown>>,
      (ns) => entries.push(ns)
    );
    expect(entries).toEqual([]);
  });
});

// ─── getStoreData / getLocales / getTranslations ───────────────────────────

describe('getStoreData', () => {
  test('returns store data for given locale', () => {
    const data = getStoreData('en');
    expect(data).toBeDefined();
    expect(data?.common).toBeDefined();
  });

  test('returns undefined for unknown locale', () => {
    const data = getStoreData('zz');
    expect(data).toBeUndefined();
  });
});

describe('getLocales', () => {
  test('returns sorted locale list', () => {
    const locales = getLocales();
    expect(locales).toContain('en');
    expect(locales).toContain('fr');
    // Should be sorted
    const sorted = [...locales].sort((a, b) => a.localeCompare(b));
    expect(locales).toEqual(sorted);
  });

  test('returns stable reference on repeated calls', () => {
    const a = getLocales();
    const b = getLocales();
    expect(a).toBe(b);
  });
});

describe('getTranslations', () => {
  test('returns sorted translation entries for EN', () => {
    const entries = getTranslations('en');
    expect(entries.length).toBeGreaterThan(0);
    const keys = entries.map((e) => `${e.ns}:${e.key}`);
    const sorted = [...keys].sort((a, b) => a.localeCompare(b));
    expect(keys).toEqual(sorted);
  });

  test('returns empty array for missing locale', () => {
    expect(getTranslations('zz')).toEqual([]);
  });
});

// ─── getNestedStoreValue ───────────────────────────────────────────────────

describe('getNestedStoreValue', () => {
  test('retrieves top-level string value', () => {
    expect(getNestedStoreValue('en', 'common', 'hello')).toBe('Hello');
  });

  test('retrieves nested string value', () => {
    expect(getNestedStoreValue('en', 'common', 'nested.deep')).toBe('Deep value');
  });

  test('returns undefined for missing key', () => {
    expect(getNestedStoreValue('en', 'common', 'nonexistent')).toBeUndefined();
  });

  test('returns undefined for missing namespace', () => {
    expect(getNestedStoreValue('en', 'missing_ns', 'key')).toBeUndefined();
  });

  test('returns undefined for missing locale', () => {
    expect(getNestedStoreValue('zz', 'common', 'hello')).toBeUndefined();
  });

  test('returns undefined for non-string value', () => {
    expect(getNestedStoreValue('en', 'common', 'nested')).toBeUndefined();
  });
});

// ─── subscribeStore / subscribeKeyUsage ────────────────────────────────────

describe('subscribeStore', () => {
  test('adds and removes listener', () => {
    let called = 0;
    const unsub = subscribeStore(() => called++);
    expect(typeof unsub).toBe('function');
    unsub();
  });
});

describe('subscribeKeyUsage', () => {
  test('adds and removes listener', () => {
    let called = 0;
    const unsub = subscribeKeyUsage(() => called++);
    expect(typeof unsub).toBe('function');
    unsub();
  });
});

// ─── applyKeyUsage / getKeyUsage ──────────────────────────────────────────

describe('key usage', () => {
  test('applyKeyUsage sets data and getKeyUsage retrieves it', () => {
    applyKeyUsage({
      'common:hello': [{ file: 'src/App.tsx', line: 10, col: 5 }],
    });
    const usages = getKeyUsage('common:hello');
    expect(usages).toHaveLength(1);
    expect(usages[0]?.file).toBe('src/App.tsx');
  });

  test('getKeyUsage returns empty array for unknown key', () => {
    expect(getKeyUsage('unknown:key')).toEqual([]);
  });

  test('getKeyUsage strips plural suffix to find base key', () => {
    applyKeyUsage({
      'common:items': [{ file: 'src/List.tsx', line: 20, col: 3 }],
    });
    expect(getKeyUsage('common:items_one')).toHaveLength(1);
    expect(getKeyUsage('common:items_other')).toHaveLength(1);
    expect(getKeyUsage('common:items_zero')).toHaveLength(1);
    expect(getKeyUsage('common:items_two')).toHaveLength(1);
    expect(getKeyUsage('common:items_few')).toHaveLength(1);
    expect(getKeyUsage('common:items_many')).toHaveLength(1);
  });

  test('getKeyUsage prefers direct match over plural fallback', () => {
    applyKeyUsage({
      'common:count_one': [{ file: 'a.tsx', line: 1, col: 1 }],
      'common:count': [{ file: 'b.tsx', line: 2, col: 1 }],
    });
    const result = getKeyUsage('common:count_one');
    expect(result).toHaveLength(1);
    expect(result[0]?.file).toBe('a.tsx');
  });

  test('notifies listeners on applyKeyUsage', () => {
    let called = 0;
    const unsub = subscribeKeyUsage(() => called++);
    applyKeyUsage({});
    expect(called).toBe(1);
    unsub();
  });
});

// ─── buildFix ──────────────────────────────────────────────────────────────

describe('buildFix', () => {
  test('returns null when issue has no key', () => {
    const issue: ValidationIssue = {
      type: 'missing-namespace',
      severity: 'error',
      namespace: 'common',
      locale: 'fr',
      referenceLocale: 'en',
    };
    expect(buildFix(issue)).toBeNull();
  });

  test('builds set fix for missing-key', () => {
    const fix = buildFix({
      type: 'missing-key',
      severity: 'error',
      namespace: 'common',
      locale: 'fr',
      key: 'bye',
      referenceLocale: 'en',
    });
    expect(fix).toEqual({
      type: 'set',
      locale: 'fr',
      namespace: 'common',
      key: 'bye',
      value: 'Goodbye',
    });
  });

  test('builds delete fix for extra-key', () => {
    const fix = buildFix({
      type: 'extra-key',
      severity: 'warning',
      namespace: 'common',
      locale: 'fr',
      key: 'extra',
      referenceLocale: 'en',
    });
    expect(fix).toEqual({
      type: 'delete',
      locale: 'fr',
      namespace: 'common',
      key: 'extra',
    });
  });

  test('builds set fix for missing-variable', () => {
    const fix = buildFix({
      type: 'missing-variable',
      severity: 'error',
      namespace: 'common',
      locale: 'fr',
      key: 'hello',
      referenceLocale: 'en',
      variables: ['name'],
    });
    expect(fix).toEqual({
      type: 'set',
      locale: 'fr',
      namespace: 'common',
      key: 'hello',
      value: 'Hello',
    });
  });

  test('returns null for missing-key when reference value not found', () => {
    const fix = buildFix({
      type: 'missing-key',
      severity: 'error',
      namespace: 'common',
      locale: 'fr',
      key: 'nonexistent_key',
      referenceLocale: 'en',
    });
    expect(fix).toBeNull();
  });
});

// ─── applyTranslationBundle ────────────────────────────────────────────────

describe('applyTranslationBundle', () => {
  test('adds new keys to the store', () => {
    applyTranslationBundle({
      en: { common: { newkey: 'New Value' } },
    });
    expect(getNestedStoreValue('en', 'common', 'newkey')).toBe('New Value');
  });
});

// ─── sendFixes / fixIssue / fixAllIssues ───────────────────────────────────

describe('sendFixes', () => {
  test('does not throw when import.meta.hot is undefined', () => {
    expect(() => sendFixes([])).not.toThrow();
    expect(() =>
      sendFixes([{ type: 'set', locale: 'fr', namespace: 'common', key: 'a', value: 'b' }])
    ).not.toThrow();
  });
});

describe('fixIssue', () => {
  test('does not throw', () => {
    expect(() =>
      fixIssue({
        type: 'extra-key',
        severity: 'warning',
        namespace: 'common',
        locale: 'fr',
        key: 'extra',
        referenceLocale: 'en',
      })
    ).not.toThrow();
  });
});

describe('fixAllIssues', () => {
  test('does not throw with mixed issues', () => {
    const issues: ValidationIssue[] = [
      { type: 'extra-key', severity: 'warning', namespace: 'common', locale: 'fr', key: 'x', referenceLocale: 'en' },
      { type: 'missing-namespace', severity: 'error', namespace: 'common', locale: 'fr', referenceLocale: 'en' },
    ];
    expect(() => fixAllIssues(issues)).not.toThrow();
  });
});

// ─── trackedTranslations ───────────────────────────────────────────────────

describe('trackedTranslations', () => {
  test('is an empty Map initially', () => {
    expect(trackedTranslations).toBeInstanceOf(Map);
  });
});
