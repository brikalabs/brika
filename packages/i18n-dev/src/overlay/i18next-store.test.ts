import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import i18next from 'i18next';
import {
  applyTranslationBundle,
  getLocales,
  getNestedStoreValue,
  getStoreData,
  removeFromI18nextStore,
  subscribeStore,
  updateI18nextStore,
} from './i18next-store';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      fallbackLng: false,
      resources: {},
    });
  }
});

beforeEach(() => {
  applyTranslationBundle({
    en: {
      store_ns: { a: 'A', b: { deep: 'Deep' } },
      other_ns: { x: 'X' },
    },
    fr: {
      store_ns: { a: 'A-fr' },
    },
  });
});

describe('getStoreData — locale defaulting', () => {
  test('returns current-language data when no locale arg is passed', () => {
    const data = getStoreData();
    expect(data).toBeDefined();
    expect(data?.store_ns).toBeDefined();
  });

  test('returns undefined for a locale not in the store', () => {
    expect(getStoreData('zz')).toBeUndefined();
  });
});

describe('getLocales', () => {
  test('returns the live locale list excluding "dev"', () => {
    const locales = getLocales();
    expect(locales).toContain('en');
    expect(locales).toContain('fr');
    expect(locales).not.toContain('dev');
  });

  test('returns a stable reference between consecutive calls', () => {
    const a = getLocales();
    const b = getLocales();
    expect(a).toBe(b);
  });
});

describe('updateI18nextStore', () => {
  test('writes a new top-level key on an existing namespace', () => {
    updateI18nextStore('en', 'store_ns', 'fresh', 'Fresh!');
    expect(getNestedStoreValue('en', 'store_ns', 'fresh')).toBe('Fresh!');
  });

  test('writes a nested key via dot-path', () => {
    updateI18nextStore('en', 'store_ns', 'b.newchild', 'Nested!');
    expect(getNestedStoreValue('en', 'store_ns', 'b.newchild')).toBe('Nested!');
  });

  test('is a no-op when the namespace does not exist', () => {
    updateI18nextStore('en', 'never_existed', 'k', 'v');
    expect(getNestedStoreValue('en', 'never_existed', 'k')).toBeUndefined();
  });

  test('is a no-op when the locale does not exist', () => {
    updateI18nextStore('zz', 'store_ns', 'k', 'v');
    expect(getNestedStoreValue('zz', 'store_ns', 'k')).toBeUndefined();
  });
});

describe('removeFromI18nextStore', () => {
  test('removes an existing key', () => {
    expect(getNestedStoreValue('en', 'store_ns', 'a')).toBe('A');
    removeFromI18nextStore('en', 'store_ns', 'a');
    expect(getNestedStoreValue('en', 'store_ns', 'a')).toBeUndefined();
  });

  test('removes a nested key', () => {
    expect(getNestedStoreValue('en', 'store_ns', 'b.deep')).toBe('Deep');
    removeFromI18nextStore('en', 'store_ns', 'b.deep');
    expect(getNestedStoreValue('en', 'store_ns', 'b.deep')).toBeUndefined();
  });

  test('is a no-op when key does not exist', () => {
    expect(() => removeFromI18nextStore('en', 'store_ns', 'nope')).not.toThrow();
  });

  test('is a no-op when namespace does not exist', () => {
    expect(() => removeFromI18nextStore('en', 'never_existed', 'k')).not.toThrow();
  });

  test('is a no-op when locale does not exist', () => {
    expect(() => removeFromI18nextStore('zz', 'store_ns', 'a')).not.toThrow();
  });
});

describe('subscribeStore', () => {
  test('listeners fire on mutations and can be unsubscribed', () => {
    let calls = 0;
    const unsub = subscribeStore(() => calls++);
    updateI18nextStore('en', 'store_ns', 'sub_a', 'Sub A');
    updateI18nextStore('en', 'store_ns', 'sub_b', 'Sub B');
    expect(calls).toBeGreaterThanOrEqual(2);
    unsub();
    const after = calls;
    updateI18nextStore('en', 'store_ns', 'sub_c', 'Sub C');
    expect(calls).toBe(after);
  });
});

describe('applyTranslationBundle', () => {
  test('merges into an existing namespace without dropping other keys', () => {
    applyTranslationBundle({
      en: { store_ns: { merged_in: 'New' } },
    });
    expect(getNestedStoreValue('en', 'store_ns', 'merged_in')).toBe('New');
    expect(getNestedStoreValue('en', 'store_ns', 'a')).toBe('A');
  });

  test('introduces a brand-new locale', () => {
    applyTranslationBundle({
      es: { store_ns: { hola: 'Hola' } },
    });
    expect(getNestedStoreValue('es', 'store_ns', 'hola')).toBe('Hola');
  });
});

describe('getNestedStoreValue — coverage paths', () => {
  test('returns undefined when path resolves to a non-string (object)', () => {
    expect(getNestedStoreValue('en', 'store_ns', 'b')).toBeUndefined();
  });
});
