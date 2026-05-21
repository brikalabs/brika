import { describe, expect, test } from 'bun:test';
import { countLeafKeys, deepMerge, mergeFallbackChain } from '../merge';

describe('deepMerge', () => {
  test('merges flat objects, source overrides target', () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 });
  });

  test('merges nested objects recursively', () => {
    expect(
      deepMerge({ ui: { title: 'A', subtitle: 'B' } }, { ui: { subtitle: 'C', extra: 'D' } })
    ).toEqual({ ui: { title: 'A', subtitle: 'C', extra: 'D' } });
  });

  test('arrays replace rather than merge', () => {
    expect(deepMerge({ list: [1, 2, 3] }, { list: [4] })).toEqual({ list: [4] });
  });

  test('null source value replaces nested target', () => {
    expect(deepMerge({ a: { b: 1 } }, { a: null })).toEqual({ a: null });
  });

  test('does not mutate inputs', () => {
    const target = { a: { b: 1 } };
    const source = { a: { c: 2 } };
    const result = deepMerge(target, source);
    expect(target).toEqual({ a: { b: 1 } });
    expect(source).toEqual({ a: { c: 2 } });
    expect(result).toEqual({ a: { b: 1, c: 2 } });
  });

  test('source primitive overrides nested target', () => {
    expect(deepMerge({ a: { b: 1 } }, { a: 'simple' })).toEqual({ a: 'simple' });
  });
});

describe('mergeFallbackChain', () => {
  test('merges each locale into the result, last in the reverse chain wins', () => {
    const data = new Map([
      ['en', { a: 'en-a', b: 'en-b' }],
      ['fr', { a: 'fr-a' }],
    ]);
    expect(mergeFallbackChain(['fr', 'en'], (loc) => data.get(loc))).toEqual({
      a: 'fr-a',
      b: 'en-b',
    });
  });

  test('skips locales not present in the lookup', () => {
    const data = new Map([['en', { a: 'en' }]]);
    expect(mergeFallbackChain(['xx', 'en'], (loc) => data.get(loc))).toEqual({ a: 'en' });
  });

  test('returns empty object when no chain entry resolves', () => {
    expect(mergeFallbackChain(['xx', 'yy'], () => undefined)).toEqual({});
  });
});

describe('countLeafKeys', () => {
  test('counts top-level leaves', () => {
    expect(countLeafKeys({ a: 1, b: 'x', c: true })).toBe(3);
  });

  test('recurses through nested objects', () => {
    expect(countLeafKeys({ a: 1, b: { c: 2, d: { e: 3 } } })).toBe(3);
  });

  test('counts arrays as a single leaf', () => {
    expect(countLeafKeys({ list: [1, 2, 3] })).toBe(1);
  });

  test('null counts as a leaf', () => {
    expect(countLeafKeys({ a: null, b: 1 })).toBe(2);
  });

  test('handles circular references safely', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(countLeafKeys(obj)).toBe(1);
  });
});
