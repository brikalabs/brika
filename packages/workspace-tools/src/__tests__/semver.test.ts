import { describe, expect, test } from 'bun:test';
import { applyBump, BUMP_TYPES, compareVersions, isBumpType, isExactVersion } from '../semver';

describe('isExactVersion', () => {
  test('recognises valid x.y.z versions', () => {
    expect(isExactVersion('0.0.0')).toBe(true);
    expect(isExactVersion('1.2.3')).toBe(true);
    expect(isExactVersion('10.20.30')).toBe(true);
  });

  test('rejects non-version strings', () => {
    expect(isExactVersion('minor')).toBe(false);
    expect(isExactVersion('1.2')).toBe(false);
    expect(isExactVersion('v1.2.3')).toBe(false);
    expect(isExactVersion('')).toBe(false);
  });
});

describe('isBumpType', () => {
  test('accepts bump keywords', () => {
    for (const t of BUMP_TYPES) {
      expect(isBumpType(t)).toBe(true);
    }
  });

  test('rejects non-bump strings', () => {
    expect(isBumpType('custom')).toBe(false);
    expect(isBumpType('1.2.3')).toBe(false);
    expect(isBumpType('')).toBe(false);
  });
});

describe('applyBump', () => {
  test('bumps major and resets minor/patch', () => {
    expect(applyBump('0.2.1', 'major')).toBe('1.0.0');
    expect(applyBump('1.9.9', 'major')).toBe('2.0.0');
  });

  test('bumps minor and resets patch', () => {
    expect(applyBump('0.2.1', 'minor')).toBe('0.3.0');
    expect(applyBump('1.0.9', 'minor')).toBe('1.1.0');
  });

  test('bumps patch only', () => {
    expect(applyBump('0.2.1', 'patch')).toBe('0.2.2');
    expect(applyBump('1.0.0', 'patch')).toBe('1.0.1');
  });

  test('returns exact version when given x.y.z', () => {
    expect(applyBump('0.2.1', '1.5.0')).toBe('1.5.0');
    expect(applyBump('3.0.0', '3.0.0')).toBe('3.0.0');
  });

  test('throws on unknown bump type', () => {
    expect(() => applyBump('1.0.0', 'hot')).toThrow();
    expect(() => applyBump('1.0.0', 'custom')).toThrow();
  });

  test('throws on malformed current version', () => {
    expect(() => applyBump('not-a-version', 'minor')).toThrow();
    expect(() => applyBump('1.2', 'patch')).toThrow();
  });
});

describe('compareVersions', () => {
  test('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.3.0', '0.3.0')).toBe(0);
  });

  test('returns -1 when a < b', () => {
    expect(compareVersions('0.9.0', '1.0.0')).toBe(-1);
    expect(compareVersions('0.2.9', '0.3.0')).toBe(-1);
  });

  test('returns 1 when a > b', () => {
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    expect(compareVersions('0.3.1', '0.3.0')).toBe(1);
  });
});
