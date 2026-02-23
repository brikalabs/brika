import { describe, expect, test } from 'bun:test';
import { arePortTypesCompatible } from '..';

// ─────────────────────────────────────────────────────────────────────────────
// arePortTypesCompatible
// ─────────────────────────────────────────────────────────────────────────────

describe('arePortTypesCompatible', () => {
  test('generic/undefined types are always compatible', () => {
    expect(arePortTypesCompatible(undefined, 'string')).toBe(true);
    expect(arePortTypesCompatible('string', undefined)).toBe(true);
    expect(arePortTypesCompatible(undefined, undefined)).toBe(true);
    expect(arePortTypesCompatible('any', 'number')).toBe(true);
    expect(arePortTypesCompatible('unknown', 'boolean')).toBe(true);
    expect(arePortTypesCompatible('generic', 'string')).toBe(true);
    expect(arePortTypesCompatible('generic-foo', 'number')).toBe(true);
  });

  test('exact type matches', () => {
    expect(arePortTypesCompatible('string', 'string')).toBe(true);
    expect(arePortTypesCompatible('number', 'number')).toBe(true);
    expect(arePortTypesCompatible('boolean', 'boolean')).toBe(true);
  });

  test('case-insensitive matching', () => {
    expect(arePortTypesCompatible('String', 'string')).toBe(true);
    expect(arePortTypesCompatible('NUMBER', 'number')).toBe(true);
  });

  test('number family compatibility', () => {
    expect(arePortTypesCompatible('number', 'integer')).toBe(true);
    expect(arePortTypesCompatible('integer', 'float')).toBe(true);
    expect(arePortTypesCompatible('float', 'double')).toBe(true);
    expect(arePortTypesCompatible('double', 'number')).toBe(true);
  });

  test('string accepts primitives', () => {
    expect(arePortTypesCompatible('number', 'string')).toBe(true);
    expect(arePortTypesCompatible('integer', 'string')).toBe(true);
    expect(arePortTypesCompatible('boolean', 'string')).toBe(true);
  });

  test('string does not accept non-primitives', () => {
    expect(arePortTypesCompatible('object', 'string')).toBe(false);
  });

  test('object/json family compatibility', () => {
    expect(arePortTypesCompatible('object', 'json')).toBe(true);
    expect(arePortTypesCompatible('json', 'record')).toBe(true);
    expect(arePortTypesCompatible('record', 'object')).toBe(true);
  });

  test('array compatibility checks base types', () => {
    expect(arePortTypesCompatible('number[]', 'number[]')).toBe(true);
    expect(arePortTypesCompatible('number[]', 'integer[]')).toBe(true);
    expect(arePortTypesCompatible('string[]', 'number[]')).toBe(false);
  });

  test('incompatible types are rejected', () => {
    expect(arePortTypesCompatible('string', 'number')).toBe(false);
    expect(arePortTypesCompatible('boolean', 'number')).toBe(false);
    expect(arePortTypesCompatible('string', 'boolean')).toBe(false);
  });
});
