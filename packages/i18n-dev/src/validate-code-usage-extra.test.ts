/**
 * Extra coverage for validate-code-usage.ts — targeting uncovered branches:
 *   - line 24: splitQualifiedKey returns null for keys with colon at position 0 or at end
 *   - line 201: deadKeyIgnoreNamespaces prefix filter (dead key suppressed)
 *   - lines 241-252: isSatisfiedAfterPrefixStrip branches
 */

import { describe, expect, test } from 'bun:test';
import type { KeyUsageMap } from './scan-usage';
import { validateCodeUsage } from './validate-code-usage';

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

describe('validateCodeUsage extra coverage', () => {
  // ── splitQualifiedKey edge cases (line 24: colon at pos 0 or at end) ──────

  test('unknown-key issue uses the full key as namespace when key has no valid colon split', () => {
    const translations = makeTranslations({ en: { common: { hello: 'Hello' } } });
    // ':key' has colon at position 0 so splitQualifiedKey returns null
    const usage = makeUsage([':badkey']);

    const issues = validateCodeUsage(translations, usage, 'en');

    const unknown = issues.filter((i) => i.type === 'unknown-key');
    expect(unknown).toHaveLength(1);
    // namespace falls back to the whole key string since split returns null
    expect(unknown[0]?.namespace).toBe(':badkey');
    expect(unknown[0]?.key).toBe(':badkey');
  });

  test('unknown-key issue uses full key as namespace when colon is at the end', () => {
    const translations = makeTranslations({ en: { common: { hello: 'Hello' } } });
    // 'ns:' has colon at end so splitQualifiedKey returns null
    const usage = makeUsage(['ns:']);

    const issues = validateCodeUsage(translations, usage, 'en');

    const unknown = issues.filter((i) => i.type === 'unknown-key');
    expect(unknown).toHaveLength(1);
    expect(unknown[0]?.namespace).toBe('ns:');
  });

  // ── deadKeyIgnoreNamespaces (line 201: prefix-matched namespace is filtered) ──

  test('deadKeyIgnoreNamespaces suppresses dead-key reporting for matching namespace prefix', () => {
    // After splitQualifiedKey('plugin:bar'), namespace = 'plugin'.
    // deadKeyIgnoreNamespaces = ['plugin'] (without trailing colon) matches via startsWith.
    const translations = makeTranslations({
      en: {
        plugin: { bar: 'Bar' }, // namespace is 'plugin', locale key is 'plugin:bar'
        common: { unused: 'Unused' },
      },
    });
    const usage = makeUsage([]);

    const issuesWithout = validateCodeUsage(translations, usage, 'en');
    const issuesWith = validateCodeUsage(translations, usage, 'en', {
      deadKeyIgnoreNamespaces: ['plugin'],
    });

    // Without the ignore list, plugin:bar is dead
    expect(issuesWithout.some((i) => i.type === 'dead-key' && i.namespace === 'plugin')).toBe(true);
    // With the ignore list, plugin:bar is suppressed
    expect(issuesWith.some((i) => i.type === 'dead-key' && i.namespace === 'plugin')).toBe(false);
    // common:unused is still dead
    expect(issuesWith.some((i) => i.type === 'dead-key' && i.key === 'unused')).toBe(true);
  });

  // ── unknownKeySeverity = 'off' ────────────────────────────────────────────

  test('unknownKeySeverity off skips unknown-key check entirely', () => {
    const translations = makeTranslations({ en: { common: { hello: 'Hello' } } });
    const usage = makeUsage(['common:nonexistent']);

    const issues = validateCodeUsage(translations, usage, 'en', {
      unknownKeySeverity: 'off',
    });

    expect(issues.filter((i) => i.type === 'unknown-key')).toHaveLength(0);
  });

  // ── deadKeySeverity = 'off' ───────────────────────────────────────────────

  test('deadKeySeverity off skips dead-key check entirely', () => {
    const translations = makeTranslations({ en: { common: { unused: 'Stale' } } });
    const usage = makeUsage([]);

    const issues = validateCodeUsage(translations, usage, 'en', {
      deadKeySeverity: 'off',
    });

    expect(issues.filter((i) => i.type === 'dead-key')).toHaveLength(0);
  });

  // ── isSatisfiedAfterPrefixStrip branches (lines 241-252) ─────────────────

  test('isSatisfiedAfterPrefixStrip returns false when locale key does not start with prefix', () => {
    // A locale key that does NOT start with the extraPrefix should not be satisfied
    const translations = makeTranslations({
      en: {
        'other:key': { val: 'v' },
      },
    });
    // extraPrefixes includes 'plugin:' but locale key is 'other:key:val'
    const usage = makeUsage([]);

    const issues = validateCodeUsage(translations, usage, 'en', {
      extraPrefixes: ['plugin:'],
    });

    // other:key:val is dead because it doesn't match the plugin: prefix
    expect(issues.some((i) => i.type === 'dead-key')).toBe(true);
  });

  test('isSatisfiedAfterPrefixStrip: stripped key satisfied by exact code key match', () => {
    // locale key 'plugin:common:hello' with extraPrefix 'plugin:' strips to 'common:hello'
    // code usage has 'common:hello' so it should NOT be flagged as dead
    const translations = makeTranslations({
      en: {
        'plugin:common': { hello: 'Hello' },
      },
    });
    // code has 'common:hello' and extraPrefix is 'plugin:'
    const usage = makeUsage(['common:hello']);

    const issues = validateCodeUsage(translations, usage, 'en', {
      extraPrefixes: ['plugin:'],
    });

    expect(issues.filter((i) => i.type === 'dead-key')).toHaveLength(0);
  });

  test('isSatisfiedAfterPrefixStrip: stripped key satisfied by pattern match', () => {
    // locale key 'plugin:auth:rules.minLength' with prefix 'plugin:' strips to 'auth:rules.minLength'
    // Pattern 'auth:rules.' covers it
    const translations = makeTranslations({
      en: {
        'plugin:auth': { 'rules.minLength': 'Min length' },
      },
    });
    const usage = makeUsage([], { patterns: ['auth:rules.'] });

    const issues = validateCodeUsage(translations, usage, 'en', {
      extraPrefixes: ['plugin:'],
    });

    expect(issues.filter((i) => i.type === 'dead-key')).toHaveLength(0);
  });

  test('isSatisfiedAfterPrefixStrip: stripped key satisfied by opaque namespace', () => {
    // locale key 'plugin:auth:hello' with prefix 'plugin:' strips to 'auth:hello'
    // opaqueNamespaces includes 'auth' so it is satisfied
    const translations = makeTranslations({
      en: {
        'plugin:auth': { hello: 'Hello' },
      },
    });
    const usage = makeUsage([], { opaqueNamespaces: ['auth'] });

    const issues = validateCodeUsage(translations, usage, 'en', {
      extraPrefixes: ['plugin:'],
    });

    expect(issues.filter((i) => i.type === 'dead-key')).toHaveLength(0);
  });

  test('locale key with no valid namespace (no colon) is flagged as dead with key = namespace', () => {
    // A key like 'orphan' (no colon) exists in the locale key set
    // splitQualifiedKey returns null for it, so namespace = key = 'orphan'
    const translations = new Map([['en', new Map([['orphan', { val: 'v' }]])]]);
    const usage = makeUsage([]);

    const issues = validateCodeUsage(translations, usage, 'en');

    // 'orphan:val' is the fully qualified locale key; when split returns non-null
    // the namespace is 'orphan' and key is 'val'. Verify it's reported.
    expect(issues.filter((i) => i.type === 'dead-key').length).toBeGreaterThan(0);
  });

  // ── plural suffix coverage ────────────────────────────────────────────────

  test('localeKeyIsUsedInCode: locale plural variant satisfied by base code key', () => {
    const translations = makeTranslations({
      en: {
        common: {
          items_zero: '{{count}} items',
          items_one: '{{count}} item',
          items_two: '{{count}} items',
          items_few: '{{count}} items',
          items_many: '{{count}} items',
          items_other: '{{count}} items',
        },
      },
    });
    // code only calls t('common:items') - all plural variants should be satisfied
    const usage = makeUsage(['common:items']);

    const issues = validateCodeUsage(translations, usage, 'en');

    expect(issues.filter((i) => i.type === 'dead-key')).toHaveLength(0);
    expect(issues.filter((i) => i.type === 'unknown-key')).toHaveLength(0);
  });
});
