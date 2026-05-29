/**
 * Tests for Plugin Utils
 */

import { describe, expect, test } from 'bun:test';
import { generateUid, HUB_VERSION, now, satisfiesVersion } from '@/runtime/plugins/utils';

describe('now', () => {
  test('returns current timestamp', () => {
    const before = Date.now();
    const result = now();
    const after = Date.now();

    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });
});

describe('generateUid', () => {
  test('returns a string', () => {
    const uid = generateUid('test-plugin');
    expect(typeof uid).toBe('string');
    expect(uid.length).toBeGreaterThan(0);
  });

  test('returns same uid for same input', () => {
    const uid1 = generateUid('@brika/plugin-timer');
    const uid2 = generateUid('@brika/plugin-timer');
    expect(uid1).toBe(uid2);
  });

  test('returns different uids for different inputs', () => {
    const uid1 = generateUid('plugin-a');
    const uid2 = generateUid('plugin-b');
    expect(uid1).not.toBe(uid2);
  });

  test('returns url-safe characters (base36)', () => {
    const uid = generateUid('test');
    // base36 only uses 0-9 and a-z
    expect(uid).toMatch(/^[0-9a-z]+$/);
  });
});

describe('satisfiesVersion', () => {
  test('checks caret range', () => {
    expect(satisfiesVersion('1.2.3', '^1.0.0')).toBe(true);
    expect(satisfiesVersion('1.9.9', '^1.0.0')).toBe(true);
    expect(satisfiesVersion('2.0.0', '^1.0.0')).toBe(false);
    expect(satisfiesVersion('0.9.9', '^1.0.0')).toBe(false);
  });

  test('checks tilde range', () => {
    expect(satisfiesVersion('1.2.3', '~1.2.0')).toBe(true);
    expect(satisfiesVersion('1.2.9', '~1.2.0')).toBe(true);
    expect(satisfiesVersion('1.3.0', '~1.2.0')).toBe(false);
  });

  test('checks exact version', () => {
    expect(satisfiesVersion('1.0.0', '1.0.0')).toBe(true);
    expect(satisfiesVersion('1.0.1', '1.0.0')).toBe(false);
  });
});

describe('HUB_VERSION', () => {
  test('is exported', () => {
    expect(HUB_VERSION).toBeDefined();
    expect(typeof HUB_VERSION).toBe('string');
  });
});
