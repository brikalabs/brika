import { describe, expect, test } from 'bun:test';
import { isPluginPackage, mustGet, parseFilters } from '../publish-utils';
import type { WorkspacePackage } from '../workspace';

// ─── isPluginPackage ──────────────────────────────────────────────────────────

describe('isPluginPackage', () => {
  function makePkg(relativePath: string): WorkspacePackage {
    return {
      name: 'test-pkg',
      version: '1.0.0',
      path: `/workspace/${relativePath}/package.json`,
      relativePath,
      isPrivate: false,
    };
  }

  test('returns true for packages under plugins/', () => {
    expect(isPluginPackage(makePkg('plugins/my-plugin'))).toBe(true);
    expect(isPluginPackage(makePkg('plugins/matter/package.json'))).toBe(true);
  });

  test('returns false for packages under packages/', () => {
    expect(isPluginPackage(makePkg('packages/sdk'))).toBe(false);
    expect(isPluginPackage(makePkg('packages/schema'))).toBe(false);
  });

  test('returns false for packages under apps/', () => {
    expect(isPluginPackage(makePkg('apps/hub'))).toBe(false);
  });

  test('returns false for root package.json', () => {
    expect(isPluginPackage(makePkg('package.json'))).toBe(false);
  });

  test('returns false for paths that contain "plugins" but do not start with it', () => {
    expect(isPluginPackage(makePkg('packages/plugins-helper'))).toBe(false);
    expect(isPluginPackage(makePkg('apps/plugins'))).toBe(false);
  });
});

// ─── parseFilters ─────────────────────────────────────────────────────────────

describe('parseFilters', () => {
  test('wraps a single string into an array', () => {
    expect(parseFilters('@brika/*')).toEqual(['@brika/*']);
  });

  test('returns the array as-is for a string array', () => {
    expect(parseFilters(['@brika/sdk', '@brika/hub'])).toEqual(['@brika/sdk', '@brika/hub']);
  });

  test('filters out non-string entries from an array', () => {
    expect(parseFilters(['valid', 123, null, 'also-valid', undefined])).toEqual([
      'valid',
      'also-valid',
    ]);
  });

  test('returns empty array for undefined', () => {
    expect(parseFilters(undefined)).toEqual([]);
  });

  test('returns empty array for null', () => {
    expect(parseFilters(null)).toEqual([]);
  });

  test('returns empty array for a number', () => {
    expect(parseFilters(42)).toEqual([]);
  });

  test('returns empty array for a boolean', () => {
    expect(parseFilters(true)).toEqual([]);
    expect(parseFilters(false)).toEqual([]);
  });

  test('returns empty array for an empty array', () => {
    expect(parseFilters([])).toEqual([]);
  });

  test('returns single-element array for empty string', () => {
    expect(parseFilters('')).toEqual(['']);
  });
});

// ─── mustGet ──────────────────────────────────────────────────────────────────

describe('mustGet', () => {
  test('returns the value when key exists', () => {
    const map = new Map<string, number>([
      ['a', 1],
      ['b', 2],
    ]);
    expect(mustGet(map, 'a', 'not found')).toBe(1);
    expect(mustGet(map, 'b', 'not found')).toBe(2);
  });

  test('throws with the provided message when key is missing', () => {
    const map = new Map<string, number>();
    expect(() => mustGet(map, 'missing', 'Key "missing" not found')).toThrow(
      'Key "missing" not found'
    );
  });

  test('throws when value is explicitly undefined', () => {
    const map = new Map<string, undefined>([['key', undefined]]);
    expect(() => mustGet(map, 'key', 'undefined value')).toThrow('undefined value');
  });

  test('returns falsy values that are not undefined', () => {
    const map = new Map<string, number | string | null | boolean>();
    map.set('zero', 0);
    map.set('empty', '');
    map.set('null', null);
    map.set('false', false);

    expect(mustGet(map, 'zero', 'fail')).toBe(0);
    expect(mustGet(map, 'empty', 'fail')).toBe('');
    expect(mustGet(map, 'null', 'fail')).toBeNull();
    expect(mustGet(map, 'false', 'fail')).toBe(false);
  });

  test('works with non-string keys', () => {
    const map = new Map<number, string>([[42, 'answer']]);
    expect(mustGet(map, 42, 'not found')).toBe('answer');
  });
});
