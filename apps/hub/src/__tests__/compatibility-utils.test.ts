/**
 * Tests for compatibility checking utilities
 */
import { describe, expect, test } from 'bun:test';
import {
  checkCompatibility,
  checkPluginCompatibility,
  meetsMinimumVersion,
} from '@/runtime/utils/compatibility';

describe('checkCompatibility', () => {
  test('returns incompatible when no engine requirement', () => {
    const result = checkCompatibility(undefined, '0.3.0');
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain('No engine requirement');
  });

  test('returns compatible when version satisfies range', () => {
    const result = checkCompatibility('^0.3.0', '0.3.0');
    expect(result.compatible).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  test('returns incompatible when version does not satisfy range', () => {
    const result = checkCompatibility('^1.0.0', '0.3.0');
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain('Requires Brika');
  });

  test('handles invalid current version', () => {
    const result = checkCompatibility('^1.0.0', 'invalid');
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain('Invalid current version');
  });

  test('handles exact version match', () => {
    const result = checkCompatibility('0.3.0', '0.3.0');
    expect(result.compatible).toBe(true);
  });

  test('handles gte range', () => {
    const result = checkCompatibility('>=0.2.0', '0.3.0');
    expect(result.compatible).toBe(true);
  });
});

describe('meetsMinimumVersion', () => {
  test('returns true when no minimum version', () => {
    expect(meetsMinimumVersion('1.0.0', undefined)).toBe(true);
  });

  test('returns true when version >= minimum', () => {
    expect(meetsMinimumVersion('1.0.0', '0.5.0')).toBe(true);
    expect(meetsMinimumVersion('1.0.0', '1.0.0')).toBe(true);
  });

  test('returns false when version < minimum', () => {
    expect(meetsMinimumVersion('0.3.0', '1.0.0')).toBe(false);
  });
});

describe('checkPluginCompatibility', () => {
  test('suggests contacting author when no engines field', () => {
    const result = checkPluginCompatibility({
      name: 'test-plugin',
      version: '1.0.0',
    });
    expect(result.compatible).toBe(false);
    expect(result.suggestion).toContain('Contact the plugin author');
  });

  test('suggests updating when incompatible', () => {
    const result = checkPluginCompatibility({
      name: 'test-plugin',
      version: '1.0.0',
      engines: { brika: '^99.0.0' },
    });
    expect(result.compatible).toBe(false);
    expect(result.suggestion).toContain('update Brika');
  });

  test('returns compatible without suggestion when satisfied', () => {
    const result = checkPluginCompatibility({
      name: 'test-plugin',
      version: '1.0.0',
      engines: { brika: '>=0.1.0' },
    });
    expect(result.compatible).toBe(true);
    expect(result.suggestion).toBeUndefined();
  });
});
