import { describe, expect, test } from 'bun:test';
import { cursorFilter, endTsFilter, oneOrMany, startTsFilter } from '../helpers';

// Use a minimal column mock — helpers only call col.getSQL which drizzle handles at query time.
// We verify the filter returns undefined (skip) or a truthy SQL fragment (apply).

const col = {} as Parameters<typeof oneOrMany>[0];

describe('oneOrMany', () => {
  test('returns undefined for undefined value', () => {
    expect(oneOrMany(col, undefined)).toBeUndefined();
  });

  test('returns undefined for null value', () => {
    expect(oneOrMany(col, null)).toBeUndefined();
  });

  test('returns a fragment for a scalar value', () => {
    expect(oneOrMany(col, 'foo')).toBeDefined();
  });

  test('returns a fragment for an array value', () => {
    expect(oneOrMany(col, ['a', 'b'])).toBeDefined();
  });
});

describe('cursorFilter', () => {
  test('returns undefined when cursor is undefined', () => {
    expect(cursorFilter(col, undefined, 'desc')).toBeUndefined();
  });

  test('returns a fragment for desc order', () => {
    expect(cursorFilter(col, 10, 'desc')).toBeDefined();
  });

  test('returns a fragment for asc order', () => {
    expect(cursorFilter(col, 10, 'asc')).toBeDefined();
  });
});

describe('startTsFilter', () => {
  test('returns undefined when ts is undefined', () => {
    expect(startTsFilter(col, undefined)).toBeUndefined();
  });

  test('returns a fragment when ts is provided', () => {
    expect(startTsFilter(col, Date.now())).toBeDefined();
  });
});

describe('endTsFilter', () => {
  test('returns undefined when ts is undefined', () => {
    expect(endTsFilter(col, undefined)).toBeUndefined();
  });

  test('returns a fragment when ts is provided', () => {
    expect(endTsFilter(col, Date.now())).toBeDefined();
  });
});
