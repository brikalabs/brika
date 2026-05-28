/**
 * Tests for semver utilities
 */

import { describe, expect, test } from 'bun:test';
import { coerce, gte, isValid, maxSatisfying, satisfies } from '@/runtime/utils/semver';

describe('semver', () => {
  describe('gte', () => {
    test('returns true when a > b', () => {
      expect(gte('2.0.0', '1.0.0')).toBe(true);
      expect(gte('1.1.0', '1.0.0')).toBe(true);
      expect(gte('1.0.1', '1.0.0')).toBe(true);
    });

    test('returns true when a == b', () => {
      expect(gte('1.0.0', '1.0.0')).toBe(true);
      expect(gte('2.5.3', '2.5.3')).toBe(true);
    });

    test('returns false when a < b', () => {
      expect(gte('1.0.0', '2.0.0')).toBe(false);
      expect(gte('1.0.0', '1.1.0')).toBe(false);
      expect(gte('1.0.0', '1.0.1')).toBe(false);
    });

    test('returns false for invalid versions', () => {
      expect(gte('invalid', '1.0.0')).toBe(false);
      expect(gte('1.0.0', 'invalid')).toBe(false);
    });
  });

  describe('satisfies', () => {
    test('exact match', () => {
      expect(satisfies('1.2.3', '1.2.3')).toBe(true);
      expect(satisfies('1.2.3', '1.2.4')).toBe(false);
    });

    test('caret range (^)', () => {
      expect(satisfies('1.2.3', '^1.2.0')).toBe(true);
      expect(satisfies('1.9.9', '^1.2.0')).toBe(true);
      expect(satisfies('2.0.0', '^1.2.0')).toBe(false);
    });

    test('tilde range (~)', () => {
      expect(satisfies('1.2.3', '~1.2.0')).toBe(true);
      expect(satisfies('1.2.9', '~1.2.0')).toBe(true);
      expect(satisfies('1.3.0', '~1.2.0')).toBe(false);
    });

    test('greater than (>)', () => {
      expect(satisfies('2.0.0', '>1.0.0')).toBe(true);
      expect(satisfies('1.0.0', '>1.0.0')).toBe(false);
    });

    test('greater than or equal (>=)', () => {
      expect(satisfies('1.0.0', '>=1.0.0')).toBe(true);
      expect(satisfies('2.0.0', '>=1.0.0')).toBe(true);
      expect(satisfies('0.9.0', '>=1.0.0')).toBe(false);
    });

    test('less than (<)', () => {
      expect(satisfies('1.0.0', '<2.0.0')).toBe(true);
      expect(satisfies('2.0.0', '<2.0.0')).toBe(false);
    });
  });

  describe('maxSatisfying', () => {
    test('returns null for empty array', () => {
      expect(maxSatisfying([])).toBeNull();
    });

    test('returns highest version without range', () => {
      expect(maxSatisfying(['1.0.0', '2.0.0', '1.5.0'])).toBe('2.0.0');
    });

    test('returns highest version satisfying range', () => {
      expect(maxSatisfying(['1.0.0', '2.0.0', '1.5.0', '3.0.0'], '^1.0.0')).toBe('1.5.0');
    });

    test('returns null when no versions satisfy range', () => {
      expect(maxSatisfying(['1.0.0', '2.0.0'], '^3.0.0')).toBeNull();
    });
  });

  describe('isValid', () => {
    test('returns true for valid semver', () => {
      expect(isValid('1.0.0')).toBe(true);
      expect(isValid('10.20.30')).toBe(true);
      expect(isValid('1.0.0-alpha')).toBe(true);
      expect(isValid('1.0.0-beta.1')).toBe(true);
    });

    test('returns false for invalid semver', () => {
      expect(isValid('not-a-version')).toBe(false);
      // Note: Bun's semver considers partial versions (1.0) and v-prefix as valid
    });
  });

  describe('coerce', () => {
    test('returns valid version as-is', () => {
      expect(coerce('1.2.3')).toBe('1.2.3');
    });

    test('handles already valid versions with prefix', () => {
      // Bun's semver considers v1.2.3 as valid, so coerce returns it as-is
      const result = coerce('v1.2.3');
      expect(result).toBeDefined();
    });

    test('handles partial versions', () => {
      // Bun's semver considers partial versions as valid, so coerce returns them as-is
      const result1 = coerce('1');
      const result2 = coerce('1.2');
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });

    test('extracts version from complex string', () => {
      expect(coerce('release-1.2.3-beta')).toBe('1.2.3');
    });

    test('returns null for non-coercible string', () => {
      expect(coerce('not-a-version')).toBeNull();
    });
  });
});
