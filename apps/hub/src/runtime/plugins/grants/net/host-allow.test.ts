/**
 * Host pattern matching — literal hosts and `*.suffix` subdomain wildcards.
 * Verifies the OWASP-recommended behaviour that `*.foo.com` does NOT match
 * the bare `foo.com` (a common bug pattern when allow-listing).
 */

import { describe, expect, test } from 'bun:test';
import { isHostAllowed, matchesHostPattern } from './host-allow';

describe('matchesHostPattern', () => {
  test('literal match is exact and case-insensitive', () => {
    expect(matchesHostPattern('api.example.com', 'api.example.com')).toBe(true);
    expect(matchesHostPattern('API.Example.COM', 'api.example.com')).toBe(true);
    expect(matchesHostPattern('api.example.com', 'API.Example.COM')).toBe(true);
  });

  test('literal pattern rejects subdomains and parent domains', () => {
    expect(matchesHostPattern('foo.api.example.com', 'api.example.com')).toBe(false);
    expect(matchesHostPattern('example.com', 'api.example.com')).toBe(false);
  });

  test('wildcard pattern matches one or more subdomain components', () => {
    expect(matchesHostPattern('api.foo.com', '*.foo.com')).toBe(true);
    expect(matchesHostPattern('a.b.foo.com', '*.foo.com')).toBe(true);
  });

  test('wildcard does NOT match the bare suffix', () => {
    // The dangerous default: allow-listing `*.foo.com` should NOT permit
    // `foo.com`. Operators must add `foo.com` explicitly if they want it.
    expect(matchesHostPattern('foo.com', '*.foo.com')).toBe(false);
  });

  test('wildcard rejects unrelated hosts', () => {
    expect(matchesHostPattern('foobar.com', '*.foo.com')).toBe(false);
    expect(matchesHostPattern('foo.com.evil.tld', '*.foo.com')).toBe(false);
  });

  test('does not implement wildcards anywhere other than `*.`', () => {
    expect(matchesHostPattern('api.example.com', 'api.*.com')).toBe(false);
    expect(matchesHostPattern('api.example.com', '*.example.*')).toBe(false);
  });
});

describe('isHostAllowed', () => {
  test('any matching pattern wins', () => {
    expect(isHostAllowed('api.example.com', ['internal.host', 'api.example.com'])).toBe(true);
    expect(isHostAllowed('foo.bar.com', ['*.bar.com', 'api.example.com'])).toBe(true);
  });

  test('empty allow-list denies everything', () => {
    expect(isHostAllowed('api.example.com', [])).toBe(false);
  });

  test('no match denies', () => {
    expect(isHostAllowed('attacker.example', ['api.example.com', '*.foo.com'])).toBe(false);
  });
});
