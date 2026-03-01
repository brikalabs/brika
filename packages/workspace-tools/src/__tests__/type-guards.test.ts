import { describe, expect, test } from 'bun:test';
import { isObjectRecord } from '../type-guards';

describe('isObjectRecord', () => {
  test('returns true for plain objects', () => {
    expect(isObjectRecord({})).toBe(true);
    expect(
      isObjectRecord({
        a: 1,
      })
    ).toBe(true);
    expect(
      isObjectRecord({
        nested: {
          deep: true,
        },
      })
    ).toBe(true);
  });

  test('returns true for arrays (arrays are objects)', () => {
    expect(isObjectRecord([])).toBe(true);
    expect(isObjectRecord([1, 2, 3])).toBe(true);
  });

  test('returns false for null', () => {
    expect(isObjectRecord(null)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(isObjectRecord(undefined)).toBe(false);
  });

  test('returns false for primitive types', () => {
    expect(isObjectRecord(42)).toBe(false);
    expect(isObjectRecord('string')).toBe(false);
    expect(isObjectRecord(true)).toBe(false);
    expect(isObjectRecord(false)).toBe(false);
    expect(isObjectRecord(0)).toBe(false);
    expect(isObjectRecord('')).toBe(false);
  });

  test('returns true for constructed objects', () => {
    expect(isObjectRecord(new Date())).toBe(true);
    expect(isObjectRecord(new Map())).toBe(true);
    expect(isObjectRecord(new Set())).toBe(true);
  });
});
