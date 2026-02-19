/**
 * Tests for compatibility utilities
 */

import { describe, expect, test } from 'bun:test';
import { HUB_VERSION } from '@/hub';
import {
  checkCompatibility,
  checkPluginCompatibility,
  meetsMinimumVersion,
} from '@/runtime/utils/compatibility';

describe('compatibility', () => {
  describe('checkCompatibility', () => {
    test('returns compatible for satisfying range', () => {
      const result = checkCompatibility('^0.2.0', '0.2.5');
      expect(result.compatible).toBe(true);
    });

    test('returns incompatible for non-satisfying range', () => {
      const result = checkCompatibility('^1.0.0', '0.2.5');
      expect(result.compatible).toBe(false);
      expect(result.reason).toContain('Requires Brika');
    });

    test('returns incompatible when no requirement specified', () => {
      const result = checkCompatibility(undefined, '0.2.5');
      expect(result.compatible).toBe(false);
      expect(result.reason).toContain('No engine requirement');
    });

    test('returns incompatible for invalid current version', () => {
      const result = checkCompatibility('^0.2.0', 'invalid');
      expect(result.compatible).toBe(false);
      expect(result.reason).toContain('Invalid current version');
    });

    test('handles caret ranges', () => {
      expect(checkCompatibility('^0.2.0', '0.2.0').compatible).toBe(true);
      expect(checkCompatibility('^0.2.0', '0.2.9').compatible).toBe(true);
      // Note: For 0.x versions, ^0.2.0 means >=0.2.0 <0.3.0 (patch-level only)
      expect(checkCompatibility('^0.2.0', '0.3.0').compatible).toBe(false);
      expect(checkCompatibility('^1.0.0', '1.9.0').compatible).toBe(true);
      expect(checkCompatibility('^1.0.0', '2.0.0').compatible).toBe(false);
    });

    test('handles tilde ranges', () => {
      expect(checkCompatibility('~0.2.0', '0.2.0').compatible).toBe(true);
      expect(checkCompatibility('~0.2.0', '0.2.5').compatible).toBe(true);
      expect(checkCompatibility('~0.2.0', '0.3.0').compatible).toBe(false);
    });

    test('handles exact versions', () => {
      expect(checkCompatibility('0.2.0', '0.2.0').compatible).toBe(true);
      expect(checkCompatibility('0.2.0', '0.2.1').compatible).toBe(false);
    });
  });

  describe('meetsMinimumVersion', () => {
    test('returns true when no minimum specified', () => {
      expect(meetsMinimumVersion('1.0.0', undefined)).toBe(true);
    });

    test('returns true when version >= minimum', () => {
      expect(meetsMinimumVersion('2.0.0', '1.0.0')).toBe(true);
      expect(meetsMinimumVersion('1.0.0', '1.0.0')).toBe(true);
    });

    test('returns false when version < minimum', () => {
      expect(meetsMinimumVersion('0.9.0', '1.0.0')).toBe(false);
    });
  });

  describe('checkPluginCompatibility', () => {
    test('returns compatible for valid plugin', () => {
      const result = checkPluginCompatibility({
        name: 'test-plugin',
        version: '1.0.0',
        engines: { brika: HUB_VERSION },
      });
      expect(result.compatible).toBe(true);
    });

    test('returns suggestion for missing engines', () => {
      const result = checkPluginCompatibility({
        name: 'test-plugin',
        version: '1.0.0',
      });
      expect(result.compatible).toBe(false);
      expect(result.suggestion).toContain('Contact the plugin author');
    });

    test('returns suggestion for incompatible version', () => {
      const result = checkPluginCompatibility({
        name: 'test-plugin',
        version: '1.0.0',
        engines: { brika: '^99.0.0' },
      });
      expect(result.compatible).toBe(false);
      expect(result.suggestion).toContain('update Brika');
    });
  });
});
