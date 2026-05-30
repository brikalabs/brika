import { describe, expect, test } from 'bun:test';
import {
  evaluateGate,
  isReleaseTag,
  latestReleaseTag,
  stripTagPrefix,
} from './check-version-monotonic';

describe('stripTagPrefix', () => {
  test('removes a leading v', () => {
    expect(stripTagPrefix('v1.2.3')).toBe('1.2.3');
    expect(stripTagPrefix('V0.3.0')).toBe('0.3.0');
  });

  test('leaves bare versions untouched', () => {
    expect(stripTagPrefix('1.2.3')).toBe('1.2.3');
  });
});

describe('isReleaseTag', () => {
  test('accepts vX.Y.Z and prerelease/build variants', () => {
    expect(isReleaseTag('v1.2.3')).toBe(true);
    expect(isReleaseTag('v0.3.0')).toBe(true);
    expect(isReleaseTag('v1.0.0-rc.1')).toBe(true);
    expect(isReleaseTag('v1.0.0+build.5')).toBe(true);
  });

  test('rejects non-release tags', () => {
    expect(isReleaseTag('canary')).toBe(false);
    expect(isReleaseTag('next')).toBe(false);
    expect(isReleaseTag('canary-20260528-211801-1bae47a')).toBe(false);
    expect(isReleaseTag('1.2.3')).toBe(false); // no v prefix
    expect(isReleaseTag('v1.2')).toBe(false);
  });
});

describe('latestReleaseTag', () => {
  test('returns null when no release tags exist', () => {
    expect(latestReleaseTag(['canary', 'next'])).toBeNull();
    expect(latestReleaseTag([])).toBeNull();
  });

  test('picks the highest semver tag, ignoring noise', () => {
    expect(latestReleaseTag(['v0.2.0', 'canary', 'v0.3.0', 'next', 'v0.2.9'])).toBe('v0.3.0');
  });

  test('orders prereleases below their release', () => {
    expect(latestReleaseTag(['v1.0.0-rc.1', 'v1.0.0'])).toBe('v1.0.0');
    expect(latestReleaseTag(['v1.0.0-rc.1', 'v1.0.0-rc.2'])).toBe('v1.0.0-rc.2');
  });
});

describe('evaluateGate', () => {
  test('passes (no-tags) when there are no release tags', () => {
    const result = evaluateGate('0.3.1', ['canary', 'next']);
    expect(result).toEqual({ ok: true, reason: 'no-tags', version: '0.3.1', tag: null });
  });

  test('passes (monotonic) when version is greater than latest tag', () => {
    const result = evaluateGate('0.3.2', ['v0.3.0', 'v0.3.1']);
    expect(result).toEqual({ ok: true, reason: 'monotonic', version: '0.3.2', tag: 'v0.3.1' });
  });

  test('passes (monotonic) when version equals latest tag', () => {
    const result = evaluateGate('0.3.1', ['v0.3.0', 'v0.3.1']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reason).toBe('monotonic');
    }
  });

  test('fails (regression) when version is lower than latest tag', () => {
    const result = evaluateGate('0.2.9', ['v0.3.0', 'v0.3.1', 'canary']);
    expect(result).toEqual({ ok: false, reason: 'regression', version: '0.2.9', tag: 'v0.3.1' });
  });

  test('treats build metadata as equal (no regression)', () => {
    const result = evaluateGate('1.0.0', ['v1.0.0+build.7']);
    expect(result.ok).toBe(true);
  });

  test('treats a release as ahead of its prerelease tag', () => {
    const result = evaluateGate('1.0.0', ['v1.0.0-rc.1']);
    expect(result.ok).toBe(true);
  });
});
