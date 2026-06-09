/**
 * Extra coverage for nested-path.ts:
 *   - line 28: resolvePath returns undefined when lastPart is empty (path ends with '.')
 */

import { describe, expect, test } from 'bun:test';
import { deleteNestedValue, resolvePath } from './nested-path';

describe('resolvePath edge cases', () => {
  test('returns undefined when path ends with a dot (empty lastPart after pop)', () => {
    // 'a.' splits to ['a', ''], pop gives '', which is falsy -> line 28
    const obj = { a: { b: 'value' } };
    expect(resolvePath(obj, 'a.')).toBeUndefined();
  });

  test('returns undefined when path is only a dot', () => {
    // '.' splits to ['', ''], pop gives '' -> line 28
    const obj = { a: 1 };
    expect(resolvePath(obj, '.')).toBeUndefined();
  });

  test('returns undefined when path has consecutive dots', () => {
    // 'a..b' splits to ['a', '', 'b'], resolve 'a' works, then '' as intermediate
    // depends on behavior, but it exercises the path length/split edge
    const obj = { a: { b: 'value' } };
    // '' as intermediate segment: obj['a'][''] is undefined -> returns undefined
    expect(resolvePath(obj, 'a..b')).toBeUndefined();
  });
});

describe('deleteNestedValue edge cases', () => {
  test('throws UnsafeKeyPathError for __proto__ segment', () => {
    const obj = {};
    expect(() => deleteNestedValue(obj, '__proto__.polluted')).toThrow();
  });

  test('throws UnsafeKeyPathError for constructor segment', () => {
    const obj = {};
    expect(() => deleteNestedValue(obj, 'constructor')).toThrow();
  });

  test('throws UnsafeKeyPathError for prototype segment', () => {
    const obj = {};
    expect(() => deleteNestedValue(obj, 'a.prototype.x')).toThrow();
  });

  test('is a no-op when path ends in dot (resolvePath returns undefined)', () => {
    const obj = { a: 'value' };
    deleteNestedValue(obj, 'a.');
    expect(obj).toEqual({ a: 'value' });
  });
});
