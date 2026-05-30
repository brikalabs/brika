import { describe, expect, it } from 'bun:test';
import { safeParseCorsAllowlist } from '@/runtime/config/config-loader';
import {
  createConfiguredOriginMatcher,
  isBrikaSubdomainOrigin,
  isPrivateNetworkOrigin,
} from './api-server';

describe('isBrikaSubdomainOrigin', () => {
  it('accepts the canonical https://hub.brika.dev shell', () => {
    expect(isBrikaSubdomainOrigin('https://hub.brika.dev')).toBe(true);
  });

  it('rejects http (only https is trusted for the remote shell)', () => {
    expect(isBrikaSubdomainOrigin('http://hub.brika.dev')).toBe(false);
  });

  it('rejects the legacy wildcard subdomain form (intentionally removed)', () => {
    expect(isBrikaSubdomainOrigin('https://maxime.hubs.brika.dev')).toBe(false);
    expect(isBrikaSubdomainOrigin('https://hubs.brika.dev')).toBe(false);
  });

  it('rejects unrelated domains and look-alikes', () => {
    expect(isBrikaSubdomainOrigin('https://attacker.example.com')).toBe(false);
    expect(isBrikaSubdomainOrigin('https://hub.brika.dev.evil.com')).toBe(false);
    expect(isBrikaSubdomainOrigin('https://nothub.brika.dev')).toBe(false);
  });

  it('rejects malformed origin strings without throwing', () => {
    expect(isBrikaSubdomainOrigin('not a url')).toBe(false);
    expect(isBrikaSubdomainOrigin('')).toBe(false);
  });
});

describe('isPrivateNetworkOrigin', () => {
  it('accepts loopback origins', () => {
    expect(isPrivateNetworkOrigin('http://localhost')).toBe(true);
    expect(isPrivateNetworkOrigin('http://localhost:5173')).toBe(true);
    expect(isPrivateNetworkOrigin('http://127.0.0.1:3000')).toBe(true);
    expect(isPrivateNetworkOrigin('http://[::1]:8080')).toBe(true);
  });

  it('accepts mDNS *.local hostnames', () => {
    expect(isPrivateNetworkOrigin('http://brikahub.local')).toBe(true);
    expect(isPrivateNetworkOrigin('https://something.local:1234')).toBe(true);
  });

  it('accepts RFC1918 ranges', () => {
    expect(isPrivateNetworkOrigin('http://10.0.0.1')).toBe(true);
    expect(isPrivateNetworkOrigin('http://192.168.1.42:8080')).toBe(true);
    expect(isPrivateNetworkOrigin('http://172.16.0.1')).toBe(true);
    expect(isPrivateNetworkOrigin('http://172.31.255.255')).toBe(true);
  });

  it('rejects addresses that look private but are not (172.x boundary)', () => {
    expect(isPrivateNetworkOrigin('http://172.15.0.1')).toBe(false);
    expect(isPrivateNetworkOrigin('http://172.32.0.1')).toBe(false);
  });

  it('accepts link-local IPv4 (169.254/16)', () => {
    expect(isPrivateNetworkOrigin('http://169.254.1.2')).toBe(true);
  });

  it('rejects public addresses', () => {
    expect(isPrivateNetworkOrigin('http://8.8.8.8')).toBe(false);
    expect(isPrivateNetworkOrigin('https://example.com')).toBe(false);
  });

  it('rejects attacker-controlled names that prefix a private IP', () => {
    // The unanchored `startsWith('10.')` regression — nip.io and sslip.io
    // make these names trivially resolvable to attacker-controlled IPs.
    expect(isPrivateNetworkOrigin('http://10.0.0.1.evil.com')).toBe(false);
    expect(isPrivateNetworkOrigin('http://192.168.1.1.attacker.example')).toBe(false);
    expect(isPrivateNetworkOrigin('http://172.16.0.1.nip.io')).toBe(false);
    expect(isPrivateNetworkOrigin('http://172.31.255.255.evil.com')).toBe(false);
    expect(isPrivateNetworkOrigin('http://169.254.1.1.evil.com')).toBe(false);
  });

  it('accepts IPv6 unique-local (fc00::/7) and link-local (fe80::/10)', () => {
    expect(isPrivateNetworkOrigin('http://[fd00::1234]')).toBe(true);
    expect(isPrivateNetworkOrigin('http://[fc00::1]:8080')).toBe(true);
    expect(isPrivateNetworkOrigin('http://[fe80::1]')).toBe(true);
    expect(isPrivateNetworkOrigin('http://[febf::1]')).toBe(true);
  });

  it('rejects malformed origin strings without throwing', () => {
    expect(isPrivateNetworkOrigin('not a url')).toBe(false);
    expect(isPrivateNetworkOrigin('')).toBe(false);
  });
});

describe('createConfiguredOriginMatcher', () => {
  it('allows a pinned production origin exactly', () => {
    const matcher = createConfiguredOriginMatcher(['https://app.example.com']);
    expect(matcher('https://app.example.com')).toBe(true);
  });

  it('matches regardless of an incidental trailing slash on the incoming origin', () => {
    const matcher = createConfiguredOriginMatcher(['https://app.example.com']);
    // URL().origin strips the trailing slash, so both forms canonicalise.
    expect(matcher('https://app.example.com/')).toBe(true);
  });

  it('blocks origins not present in the allowlist', () => {
    const matcher = createConfiguredOriginMatcher(['https://app.example.com']);
    expect(matcher('https://attacker.example.com')).toBe(false);
    expect(matcher('http://app.example.com')).toBe(false);
    expect(matcher('https://app.example.com.evil.com')).toBe(false);
  });

  it('never matches via prefix or substring of a pinned origin', () => {
    const matcher = createConfiguredOriginMatcher(['https://app.example.com']);
    expect(matcher('https://app.example.co')).toBe(false);
    expect(matcher('https://evil-app.example.com')).toBe(false);
  });

  it('matches any of several pinned origins', () => {
    const matcher = createConfiguredOriginMatcher([
      'https://app.example.com',
      'https://admin.example.com',
    ]);
    expect(matcher('https://app.example.com')).toBe(true);
    expect(matcher('https://admin.example.com')).toBe(true);
    expect(matcher('https://other.example.com')).toBe(false);
  });

  it('matches nothing when the allowlist is empty (LAN/dev defaults stay in charge)', () => {
    const matcher = createConfiguredOriginMatcher([]);
    expect(matcher('https://app.example.com')).toBe(false);
    expect(matcher('http://localhost:5173')).toBe(false);
  });

  it('rejects malformed incoming origins without throwing', () => {
    const matcher = createConfiguredOriginMatcher(['https://app.example.com']);
    expect(matcher('not a url')).toBe(false);
    expect(matcher('')).toBe(false);
  });

  it('honours allowlist entries as produced by config validation', () => {
    // A trailing slash in config is normalised to the canonical origin, so
    // the resulting matcher still allows the pinned origin and blocks others.
    const parsed = safeParseCorsAllowlist(['https://app.example.com/']);
    if (!('origins' in parsed)) {
      throw new Error('expected the allowlist to parse');
    }
    const matcher = createConfiguredOriginMatcher(parsed.origins);
    expect(matcher('https://app.example.com')).toBe(true);
    expect(matcher('https://attacker.example.com')).toBe(false);
  });
});

describe('safeParseCorsAllowlist (config validation)', () => {
  it('normalises valid origins and drops a trailing slash', () => {
    expect(safeParseCorsAllowlist(['https://app.example.com/'])).toEqual({
      origins: ['https://app.example.com'],
    });
    expect(safeParseCorsAllowlist(['http://app.example.com:8080'])).toEqual({
      origins: ['http://app.example.com:8080'],
    });
  });

  it('treats missing/empty config as an empty allowlist (falls back to LAN/dev)', () => {
    expect(safeParseCorsAllowlist(undefined)).toEqual({ origins: [] });
    expect(safeParseCorsAllowlist([])).toEqual({ origins: [] });
  });

  it('rejects malformed allowlist values (bad scheme, path-bearing, non-array)', () => {
    expect('issues' in safeParseCorsAllowlist(['ftp://app.example.com'])).toBe(true);
    expect('issues' in safeParseCorsAllowlist(['https://app.example.com/admin'])).toBe(true);
    expect('issues' in safeParseCorsAllowlist(['not a url'])).toBe(true);
    expect('issues' in safeParseCorsAllowlist('https://app.example.com')).toBe(true);
  });
});
