import { describe, expect, test } from 'bun:test';
import { flatten, flattenInto, getNestedValue } from './key-path';

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
});
