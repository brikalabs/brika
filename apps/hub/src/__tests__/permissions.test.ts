/**
 * Tests for Permission System
 *
 * Tests shared permission utilities and validates security invariants.
 */

import { describe, expect, test } from 'bun:test';
import {
  type Permission,
  PERMISSIONS,
  PERMISSION_LIST,
  filterValidPermissions,
  isValidPermission,
} from '@brika/shared';

describe('Permission System', () => {
  describe('isValidPermission', () => {
    test('returns true for known permission "location"', () => {
      expect(isValidPermission('location')).toBe(true);
    });

    test('returns false for unknown permission strings', () => {
      expect(isValidPermission('unknown')).toBe(false);
      expect(isValidPermission('')).toBe(false);
      expect(isValidPermission('Location')).toBe(false);
      expect(isValidPermission('LOCATION')).toBe(false);
    });

    test('returns false for injection attempts', () => {
      expect(isValidPermission('__proto__')).toBe(false);
      expect(isValidPermission('constructor')).toBe(false);
      expect(isValidPermission('toString')).toBe(false);
      expect(isValidPermission('hasOwnProperty')).toBe(false);
    });
  });

  describe('filterValidPermissions', () => {
    test('keeps valid permissions', () => {
      expect(filterValidPermissions(['location'])).toEqual(['location']);
    });

    test('removes unknown permissions', () => {
      expect(filterValidPermissions(['location', 'unknown', 'bad'])).toEqual(['location']);
    });

    test('returns empty array for all-invalid input', () => {
      expect(filterValidPermissions(['foo', 'bar'])).toEqual([]);
    });

    test('returns empty array for empty input', () => {
      expect(filterValidPermissions([])).toEqual([]);
    });

    test('rejects prototype pollution attempts', () => {
      expect(filterValidPermissions(['__proto__', 'constructor', 'location'])).toEqual([
        'location',
      ]);
    });
  });

  describe('PERMISSIONS registry', () => {
    test('location permission has required fields', () => {
      const loc = PERMISSIONS.location;
      expect(loc.id).toBe('location');
      expect(loc.icon).toBe('map-pin');
      expect(loc.labelKey).toBe('plugins:permissions.location');
      expect(loc.descriptionKey).toBe('plugins:permissions.locationDesc');
    });

    test('all entries have consistent id', () => {
      for (const def of PERMISSION_LIST) {
        expect(PERMISSIONS[def.id]).toBe(def);
      }
    });

    test('all entries have non-empty icon, labelKey, descriptionKey', () => {
      for (const def of PERMISSION_LIST) {
        expect(def.icon.length).toBeGreaterThan(0);
        expect(def.labelKey.length).toBeGreaterThan(0);
        expect(def.descriptionKey.length).toBeGreaterThan(0);
      }
    });
  });

  describe('PERMISSION_LIST', () => {
    test('contains all permissions from registry', () => {
      expect(PERMISSION_LIST.length).toBe(Object.keys(PERMISSIONS).length);
    });

    test('entries are PermissionDefinition objects', () => {
      for (const entry of PERMISSION_LIST) {
        expect(entry).toHaveProperty('id');
        expect(entry).toHaveProperty('icon');
        expect(entry).toHaveProperty('labelKey');
        expect(entry).toHaveProperty('descriptionKey');
      }
    });
  });

  describe('Type safety', () => {
    test('Permission type narrows correctly via isValidPermission', () => {
      const input = 'location';
      if (isValidPermission(input)) {
        // TypeScript would error here if the narrowing didn't work
        const _perm: Permission = input;
        expect(_perm).toBe('location');
      }
    });
  });
});
