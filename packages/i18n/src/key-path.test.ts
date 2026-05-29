import { describe, expect, test } from 'bun:test';
import {
  flatten,
  flattenInto,
  getNestedValue,
  isUnsafeKeySegment,
  sanitizeTranslationTree,
  setNestedValue,
  UNSAFE_SEGMENTS,
  UnsafeKeyPathError,
} from './key-path';
import type { TranslationData } from './types';

describe('getNestedValue', () => {
  test('returns top-level keys', () => {
    expect(getNestedValue({ hello: 'world' }, 'hello')).toBe('world');
  });

  test('traverses dot-separated paths', () => {
    expect(getNestedValue({ a: { b: { c: 'x' } } }, 'a.b.c')).toBe('x');
  });

  test('returns undefined for missing segments', () => {
    expect(getNestedValue({ a: { b: 'x' } }, 'a.c.d')).toBeUndefined();
  });

  test('returns undefined when traversing into a primitive', () => {
    expect(getNestedValue({ a: 'leaf' }, 'a.b')).toBeUndefined();
  });

  test('empty path returns the root', () => {
    const obj = { hello: 'world' };
    expect(getNestedValue(obj, '')).toBe(obj);
  });

  test('returns arrays as leaf values', () => {
    expect(getNestedValue({ list: [1, 2, 3] }, 'list')).toEqual([1, 2, 3]);
  });
});

describe('flatten', () => {
  test('flattens nested objects', () => {
    const flat = flatten({ a: { b: { c: 'x' } }, d: 'y' });
    expect([...flat.entries()].sort()).toEqual([
      ['a.b.c', 'x'],
      ['d', 'y'],
    ]);
  });

  test('treats arrays as leaves', () => {
    const flat = flatten({ list: [1, 2, 3] });
    expect(flat.get('list')).toEqual([1, 2, 3]);
  });

  test('flattenInto preserves existing entries', () => {
    const target = new Map<string, unknown>([['existing', 'kept']]);
    flattenInto({ a: 'new' }, '', target);
    expect(target.get('existing')).toBe('kept');
    expect(target.get('a')).toBe('new');
  });

  test('flattenInto applies a prefix to every leaf path', () => {
    const target = new Map<string, unknown>();
    flattenInto({ a: { b: 'x' }, c: 'y' }, 'ns', target);
    expect(target.get('ns.a.b')).toBe('x');
    expect(target.get('ns.c')).toBe('y');
  });
});

describe('isUnsafeKeySegment / UNSAFE_SEGMENTS', () => {
  test('UNSAFE_SEGMENTS exposes the canonical set', () => {
    expect(UNSAFE_SEGMENTS.has('__proto__')).toBe(true);
    expect(UNSAFE_SEGMENTS.has('constructor')).toBe(true);
    expect(UNSAFE_SEGMENTS.has('prototype')).toBe(true);
    expect(UNSAFE_SEGMENTS.has('hello')).toBe(false);
  });

  test('isUnsafeKeySegment returns true for prototype-chain keys', () => {
    expect(isUnsafeKeySegment('__proto__')).toBe(true);
    expect(isUnsafeKeySegment('constructor')).toBe(true);
    expect(isUnsafeKeySegment('prototype')).toBe(true);
  });

  test('isUnsafeKeySegment returns false for normal segments', () => {
    expect(isUnsafeKeySegment('hello')).toBe(false);
    expect(isUnsafeKeySegment('')).toBe(false);
    // The check is case-sensitive — `Constructor` is fine.
    expect(isUnsafeKeySegment('Constructor')).toBe(false);
  });
});

describe('UnsafeKeyPathError', () => {
  test('exposes the offending segment and a descriptive message', () => {
    const err = new UnsafeKeyPathError('__proto__');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('UnsafeKeyPathError');
    expect(err.segment).toBe('__proto__');
    expect(err.message).toContain('__proto__');
  });
});

describe('sanitizeTranslationTree', () => {
  test('returns null for non-record inputs (string, array, null)', () => {
    expect(sanitizeTranslationTree('plain string')).toBeNull();
    expect(sanitizeTranslationTree(['array', 'root'])).toBeNull();
    expect(sanitizeTranslationTree(null)).toBeNull();
    expect(sanitizeTranslationTree(42)).toBeNull();
  });

  test('drops top-level unsafe keys without touching siblings', () => {
    const parsed: unknown = JSON.parse('{"__proto__":{"polluted":true},"safe":"value"}');
    const result = sanitizeTranslationTree(parsed);
    expect(result).toEqual({ safe: 'value' });
  });

  test('drops nested unsafe keys at every depth', () => {
    const parsed: unknown = JSON.parse(
      '{"common":{"ui":{"__proto__":{"polluted":"deep"},"label":"Hi"}}}'
    );
    const result = sanitizeTranslationTree(parsed);
    expect(result).toEqual({ common: { ui: { label: 'Hi' } } });
  });

  test('passes through primitive and array leaf values', () => {
    const result = sanitizeTranslationTree({
      str: 'hello',
      num: 42,
      bool: true,
      list: [1, 2, 3],
    });
    expect(result).toEqual({
      str: 'hello',
      num: 42,
      bool: true,
      list: [1, 2, 3],
    });
  });

  test('produces an empty record for an unsafe-only nested branch', () => {
    const result = sanitizeTranslationTree({ ui: { __proto__: { x: 'y' } } });
    expect(result).toEqual({ ui: {} });
  });
});

describe('setNestedValue', () => {
  test('sets a top-level key on the root', () => {
    const data = {};
    const result = setNestedValue(data, 'hello', 'world');
    expect(result).toBe(data);
    expect(result).toEqual({ hello: 'world' });
  });

  test('creates intermediate objects for missing path segments', () => {
    const result = setNestedValue({}, 'a.b.c', 'leaf');
    expect(result).toEqual({ a: { b: { c: 'leaf' } } });
  });

  test('overwrites primitive segments along the path with new objects', () => {
    const result = setNestedValue({ a: 'leaf' }, 'a.b', 'new');
    expect(result).toEqual({ a: { b: 'new' } });
  });

  test('reuses existing intermediate objects without clobbering siblings', () => {
    const data: TranslationData = { ui: { existing: 'kept' } };
    setNestedValue(data, 'ui.title', 'New');
    expect(data).toEqual({ ui: { existing: 'kept', title: 'New' } });
  });

  test('empty path returns the root unchanged', () => {
    const data = { hello: 'world' };
    const result = setNestedValue(data, '', 'ignored');
    expect(result).toBe(data);
    expect(data).toEqual({ hello: 'world' });
  });

  test('throws UnsafeKeyPathError for prototype-chain segments at any position', () => {
    expect(() => setNestedValue({}, '__proto__.polluted', true)).toThrow(UnsafeKeyPathError);
    expect(() => setNestedValue({}, 'a.constructor.b', true)).toThrow(UnsafeKeyPathError);
    expect(() => setNestedValue({}, 'a.b.prototype', true)).toThrow(UnsafeKeyPathError);
  });

  test('UnsafeKeyPathError carries the offending segment', () => {
    try {
      setNestedValue({}, 'a.__proto__.b', 'x');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UnsafeKeyPathError);
      if (err instanceof UnsafeKeyPathError) {
        expect(err.segment).toBe('__proto__');
      }
    }
  });

  test('skips empty intermediate segments (consecutive dots)', () => {
    // `a..b` splits into ['a', '', 'b']. The intermediate loop hits the
    // empty segment and `continue`s without advancing into a nested
    // object, so the tail (`b`) lands directly on `current` — which is
    // still the freshly-created `a` object.
    const result = setNestedValue({}, 'a..b', 'leaf');
    expect(result).toEqual({ a: { b: 'leaf' } });
  });
});
