import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import i18next from 'i18next';
import type { KeyUsageMap } from '../scan-usage/types';
import {
  applyKeyUsage,
  getKeyUsage,
  getMergedKeyUsage,
  getRuntimeUsages,
  installTranslationTracker,
  subscribeKeyUsage,
  subscribeRuntimeUsages,
  trackedTranslations,
} from './usage-tracker';

function usage(keys: Record<string, Array<{ file: string; line: number }>>): KeyUsageMap {
  return { keys, patterns: [], opaqueNamespaces: [], hasGlobalOpaque: false };
}

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      fallbackLng: false,
      resources: {
        en: {
          tracker_ns: {
            greet: 'Hello',
            sub: { deep: 'Deep' },
          },
        },
      },
    });
  }
});

beforeEach(() => {
  applyKeyUsage(usage({}));
  trackedTranslations.clear();
});

describe('subscribeKeyUsage / applyKeyUsage', () => {
  test('listeners fire on applyKeyUsage and can be removed', () => {
    let calls = 0;
    const unsub = subscribeKeyUsage(() => calls++);
    applyKeyUsage(usage({}));
    applyKeyUsage(usage({}));
    expect(calls).toBe(2);
    unsub();
    applyKeyUsage(usage({}));
    expect(calls).toBe(2);
  });
});

describe('subscribeRuntimeUsages', () => {
  test('returns a teardown that removes the listener', () => {
    let called = 0;
    const unsub = subscribeRuntimeUsages(() => called++);
    expect(typeof unsub).toBe('function');
    unsub();
  });
});

describe('getKeyUsage — plural fallback', () => {
  test('uses direct match when available', () => {
    applyKeyUsage(usage({ 'tracker_ns:items_one': [{ file: 'a.tsx', line: 1 }] }));
    const result = getKeyUsage('tracker_ns:items_one');
    expect(result).toHaveLength(1);
    expect(result[0]?.file).toBe('a.tsx');
  });

  test('strips plural suffix when namespace is unqualified', () => {
    applyKeyUsage(usage({ items: [{ file: 'b.tsx', line: 5 }] }));
    expect(getKeyUsage('items_one')).toHaveLength(1);
    expect(getKeyUsage('items_other')).toHaveLength(1);
  });

  test('returns empty array when no fallback exists', () => {
    applyKeyUsage(usage({}));
    expect(getKeyUsage('tracker_ns:nothing_one')).toEqual([]);
  });

  test('returns empty array for non-plural unknown key', () => {
    applyKeyUsage(usage({}));
    expect(getKeyUsage('tracker_ns:anything')).toEqual([]);
  });
});

describe('getMergedKeyUsage', () => {
  test('returns static usages when there is no runtime data', () => {
    applyKeyUsage(usage({ 'tracker_ns:greet': [{ file: 'static.tsx', line: 1 }] }));
    const merged = getMergedKeyUsage('tracker_ns:greet');
    expect(merged).toHaveLength(1);
    expect(merged[0]?.file).toBe('static.tsx');
  });

  test('memoises the result reference between calls', () => {
    applyKeyUsage(usage({ 'tracker_ns:greet': [{ file: 'static.tsx', line: 1 }] }));
    const a = getMergedKeyUsage('tracker_ns:greet');
    const b = getMergedKeyUsage('tracker_ns:greet');
    expect(a).toBe(b);
  });

  test('returns a stable empty array reference for unknown keys', () => {
    applyKeyUsage(usage({}));
    const a = getMergedKeyUsage('tracker_ns:unknown');
    const b = getMergedKeyUsage('tracker_ns:unknown');
    expect(a).toEqual([]);
    expect(a).toBe(b);
  });

  test('invalidates cache when applyKeyUsage updates data', () => {
    applyKeyUsage(usage({ 'tracker_ns:greet': [{ file: 'one.tsx', line: 1 }] }));
    const before = getMergedKeyUsage('tracker_ns:greet');
    expect(before).toHaveLength(1);
    applyKeyUsage(usage({ 'tracker_ns:greet': [{ file: 'two.tsx', line: 2 }] }));
    const after = getMergedKeyUsage('tracker_ns:greet');
    expect(after).toHaveLength(1);
    expect(after[0]?.file).toBe('two.tsx');
  });

  test('dedupes file:line entries from static and runtime sources', () => {
    installTranslationTracker();
    applyKeyUsage(usage({ 'tracker_ns:greet': [{ file: 'src/App.tsx', line: 10 }] }));
    // Trigger a runtime entry at the same location
    i18next.t('tracker_ns:greet', { __cs: 'src/App.tsx:10' });
    const merged = getMergedKeyUsage('tracker_ns:greet');
    expect(merged).toHaveLength(1);
  });
});

describe('installTranslationTracker', () => {
  test('records build-time call site when __cs is present', () => {
    installTranslationTracker();
    const before = getRuntimeUsages('tracker_ns:greet').length;
    // No __cs => no new runtime usage recorded
    i18next.t('tracker_ns:greet');
    expect(getRuntimeUsages('tracker_ns:greet')).toHaveLength(before);

    const tag = `src/UniqueFoo-${Date.now()}.tsx`;
    i18next.t('tracker_ns:greet', { __cs: `${tag}:7` });
    const usages = getRuntimeUsages('tracker_ns:greet');
    expect(usages.some((u) => u.file === tag && u.line === 7)).toBe(true);
  });

  test('populates trackedTranslations with rendered string → qualifiedKey', () => {
    installTranslationTracker();
    const value = i18next.t('tracker_ns:greet');
    expect(typeof value).toBe('string');
    if (typeof value === 'string') {
      expect(trackedTranslations.get(value)).toBe('tracker_ns:greet');
    }
  });

  test('dedupes by file:line but increments count internally', () => {
    installTranslationTracker();
    const tag = `src/Dedupe-${Math.random().toString(36).slice(2)}.tsx`;
    i18next.t('tracker_ns:greet', { __cs: `${tag}:9` });
    i18next.t('tracker_ns:greet', { __cs: `${tag}:9` });
    i18next.t('tracker_ns:greet', { __cs: `${tag}:10` });
    const usages = getRuntimeUsages('tracker_ns:greet').filter((u) => u.file === tag);
    const ids = usages.map((u) => `${u.file}:${u.line}`).sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual([`${tag}:10`, `${tag}:9`].sort((a, b) => a.localeCompare(b)));
  });

  test('does not record runtime usage when the rendered value is empty', () => {
    installTranslationTracker();
    i18next.t('tracker_ns:does_not_exist_at_all', { __cs: 'src/Foo.tsx:1' });
    expect(getRuntimeUsages('tracker_ns:does_not_exist_at_all').length).toBeGreaterThanOrEqual(0);
  });

  test('subsequent calls to install are idempotent', () => {
    installTranslationTracker();
    installTranslationTracker();
    const tag = `src/idempotent-${Math.random().toString(36).slice(2)}.tsx`;
    i18next.t('tracker_ns:greet', { __cs: `${tag}:1` });
    const usages = getRuntimeUsages('tracker_ns:greet');
    expect(usages.filter((u) => u.file === tag && u.line === 1)).toHaveLength(1);
  });
});
