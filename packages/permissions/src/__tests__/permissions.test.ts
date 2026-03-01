import { describe, expect, test } from 'bun:test';
import { filterValidPermissions, isValidPermission, PERMISSION_LIST, PERMISSIONS } from '..';

// ─────────────────────────────────────────────────────────────────────────────
// isValidPermission
// ─────────────────────────────────────────────────────────────────────────────

describe('isValidPermission', () => {
  test('accepts known permissions', () => {
    expect(isValidPermission('location')).toBe(true);
  });

  test('rejects unknown strings', () => {
    expect(isValidPermission('network')).toBe(false);
    expect(isValidPermission('')).toBe(false);
    expect(isValidPermission('Location')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// filterValidPermissions
// ─────────────────────────────────────────────────────────────────────────────

describe('filterValidPermissions', () => {
  test('keeps valid permissions, drops invalid', () => {
    expect(filterValidPermissions(['location', 'network', 'bogus'])).toEqual(['location']);
  });

  test('returns empty for all invalid', () => {
    expect(filterValidPermissions(['x', 'y'])).toEqual([]);
  });

  test('returns empty for empty input', () => {
    expect(filterValidPermissions([])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSIONS registry
// ─────────────────────────────────────────────────────────────────────────────

describe('PERMISSIONS registry', () => {
  test('has metadata for each permission', () => {
    expect(PERMISSIONS.location).toEqual({
      id: 'location',
      icon: 'map-pin',
      labelKey: 'plugins:permissions.location',
      descriptionKey: 'plugins:permissions.locationDesc',
    });
  });

  test('PERMISSION_LIST matches PERMISSIONS values', () => {
    expect(PERMISSION_LIST).toEqual(Object.values(PERMISSIONS));
    expect(PERMISSION_LIST.length).toBeGreaterThan(0);
  });
});
