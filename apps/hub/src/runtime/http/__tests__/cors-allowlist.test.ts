import { describe, expect, it } from 'bun:test';
import { isBrikaSubdomainOrigin, isPrivateNetworkOrigin } from '../api-server';

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
