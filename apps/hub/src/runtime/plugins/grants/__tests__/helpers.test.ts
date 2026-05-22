/**
 * Pure-helper coverage for the net.fetch grant: `matchesHostPattern`,
 * `isHostAllowed`, and `parseRetryAfter`. These are the bits with the
 * trickiest edge cases (case sensitivity, hostile Retry-After values,
 * wildcard semantics) and have low test gravity from the handler tests.
 */

import { describe, expect, test } from 'bun:test';
import { isHostAllowed, matchesHostPattern, parseRetryAfter } from '../net';

describe('matchesHostPattern', () => {
  test('literal match', () => {
    expect(matchesHostPattern('api.example.com', 'api.example.com')).toBe(true);
  });

  test('case-insensitive on both sides (DNS is case-insensitive — RFC 4343)', () => {
    expect(matchesHostPattern('API.Example.com', 'api.example.com')).toBe(true);
    expect(matchesHostPattern('api.example.com', 'API.Example.com')).toBe(true);
    expect(matchesHostPattern('Foo.Bar.com', '*.BAR.com')).toBe(true);
  });

  test('one-level wildcard `*.suffix` matches subdomains', () => {
    expect(matchesHostPattern('api.example.com', '*.example.com')).toBe(true);
    expect(matchesHostPattern('foo.bar.example.com', '*.example.com')).toBe(true);
  });

  test('one-level wildcard does NOT match the bare suffix', () => {
    // `*.foo.com` matches subdomains but NOT the apex — apex must be
    // listed explicitly to avoid accidental overscope.
    expect(matchesHostPattern('foo.com', '*.foo.com')).toBe(false);
  });

  test('non-matching host returns false', () => {
    expect(matchesHostPattern('attacker.example', 'api.example.com')).toBe(false);
    expect(matchesHostPattern('api.example.com.attacker', '*.example.com')).toBe(false);
  });

  test('only the `*.` prefix is wildcard syntax — anything else is literal', () => {
    expect(matchesHostPattern('api.foo.com', 'api.*.com')).toBe(false);
    expect(matchesHostPattern('api.foo.com', '*foo.com')).toBe(false);
  });
});

describe('isHostAllowed', () => {
  test('empty allow-list denies everything', () => {
    expect(isHostAllowed('api.example.com', [])).toBe(false);
  });

  test('matches first pattern that fits', () => {
    expect(isHostAllowed('api.example.com', ['other.com', 'api.example.com', 'third.com'])).toBe(
      true
    );
  });

  test('honours wildcards in the list', () => {
    expect(isHostAllowed('foo.api.example.com', ['*.api.example.com'])).toBe(true);
  });
});

describe('parseRetryAfter', () => {
  const MAX = 60_000;

  test('returns null on missing/empty value', () => {
    expect(parseRetryAfter(null, MAX)).toBeNull();
    expect(parseRetryAfter(undefined, MAX)).toBeNull();
    expect(parseRetryAfter('', MAX)).toBeNull();
  });

  test('returns null on garbage value (so caller falls back to backoff)', () => {
    // Critical: hostile servers could send `Retry-After: garbage` to
    // induce a 0ms retry loop. Returning null lets the caller fall back
    // to the jittered exponential backoff instead.
    expect(parseRetryAfter('garbage', MAX)).toBeNull();
    expect(parseRetryAfter('not-a-date', MAX)).toBeNull();
    expect(parseRetryAfter('!!!', MAX)).toBeNull();
  });

  test('delta-seconds form', () => {
    expect(parseRetryAfter('5', MAX)).toBe(5000);
    expect(parseRetryAfter('0', MAX)).toBe(0);
  });

  test('clamps to maxMs', () => {
    expect(parseRetryAfter('600', 30_000)).toBe(30_000);
  });

  test('HTTP-date form', () => {
    const future = new Date(Date.now() + 10_000).toUTCString();
    const ms = parseRetryAfter(future, MAX);
    // toUTCString() truncates to second resolution — allow ±1.1s drift.
    expect(ms).toBeGreaterThanOrEqual(8_900);
    expect(ms).toBeLessThanOrEqual(10_100);
  });

  test('HTTP-date in the past returns 0 (retry immediately)', () => {
    const past = new Date(Date.now() - 10_000).toUTCString();
    expect(parseRetryAfter(past, MAX)).toBe(0);
  });
});
