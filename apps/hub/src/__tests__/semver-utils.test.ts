/**
 * Tests for hub semver utilities
 */
import { describe, expect, test } from 'bun:test';
import { coerce, gte, isValid, maxSatisfying, satisfies } from '@/runtime/utils/semver';

describe('gte', () => {
  test('returns true when a > b', () => {
    expect(gte('2.0.0', '1.0.0')).toBe(true);
  });

  test('returns true when a === b', () => {
    expect(gte('1.0.0', '1.0.0')).toBe(true);
  });

  test('returns false when a < b', () => {
    expect(gte('1.0.0', '2.0.0')).toBe(false);
  });

  test('returns false for invalid versions', () => {
    expect(gte('not-a-version', '1.0.0')).toBe(false);
  });
});

describe('satisfies', () => {
  test('exact version match', () => {
    expect(satisfies('1.2.3', '1.2.3')).toBe(true);
    expect(satisfies('1.2.4', '1.2.3')).toBe(false);
  });

  test('caret range', () => {
    expect(satisfies('1.3.0', '^1.2.0')).toBe(true);
    expect(satisfies('2.0.0', '^1.2.0')).toBe(false);
  });

  test('tilde range', () => {
    expect(satisfies('1.2.5', '~1.2.0')).toBe(true);
    expect(satisfies('1.3.0', '~1.2.0')).toBe(false);
  });

  test('gte range', () => {
    expect(satisfies('2.0.0', '>=1.0.0')).toBe(true);
    expect(satisfies('0.9.0', '>=1.0.0')).toBe(false);
  });
});

describe('maxSatisfying', () => {
  test('returns highest version from list', () => {
    expect(
      maxSatisfying([
        '1.0.0',
        '2.0.0',
        '1.5.0',
      ])
    ).toBe('2.0.0');
  });

  test('returns null for empty array', () => {
    expect(maxSatisfying([])).toBeNull();
  });

  test('filters by range when provided', () => {
    expect(
      maxSatisfying(
        [
          '1.0.0',
          '2.0.0',
          '1.5.0',
        ],
        '^1.0.0'
      )
    ).toBe('1.5.0');
  });

  test('returns null when no versions satisfy range', () => {
    expect(
      maxSatisfying(
        [
          '1.0.0',
          '1.5.0',
        ],
        '>=2.0.0'
      )
    ).toBeNull();
  });
});

describe('isValid', () => {
  test('returns true for valid semver', () => {
    expect(isValid('1.2.3')).toBe(true);
    expect(isValid('0.0.1')).toBe(true);
  });

  test('returns false for invalid strings', () => {
    expect(isValid('not-a-version')).toBe(false);
    expect(isValid('')).toBe(false);
  });
});

describe('coerce', () => {
  test('returns valid version as-is', () => {
    expect(coerce('1.2.3')).toBe('1.2.3');
  });

  test('coerces numeric-only strings', () => {
    const result = coerce('42');
    expect(result).not.toBeNull();
  });

  test('extracts version from non-standard formats', () => {
    const result = coerce('version-1.2.3-beta');
    expect(result).not.toBeNull();
  });

  test('returns null for non-coercible strings', () => {
    expect(coerce('no-version-here')).toBeNull();
  });
});
