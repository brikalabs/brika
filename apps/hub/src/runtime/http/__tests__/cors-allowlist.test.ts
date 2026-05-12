import { describe, expect, it } from 'bun:test';
import { isBrikaSubdomainOrigin, isPrivateNetworkOrigin } from '../api-server';

describe('isBrikaSubdomainOrigin', () => {
  it('accepts the canonical https://hubs.brika.dev shell', () => {
    expect(isBrikaSubdomainOrigin('https://hubs.brika.dev')).toBe(true);
    expect(isBrikaSubdomainOrigin('https://my-hub.hubs.brika.dev')).toBe(true);
  });

  it('rejects http (only https is trusted for the remote shell)', () => {
    expect(isBrikaSubdomainOrigin('http://hubs.brika.dev')).toBe(false);
    expect(isBrikaSubdomainOrigin('http://abc.hubs.brika.dev')).toBe(false);
  });

  it('rejects unrelated domains and look-alikes', () => {
    expect(isBrikaSubdomainOrigin('https://attacker.example.com')).toBe(false);
    expect(isBrikaSubdomainOrigin('https://hubs.brika.dev.evil.com')).toBe(false);
    expect(isBrikaSubdomainOrigin('https://nothubs.brika.dev')).toBe(false);
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

  it('rejects malformed origin strings without throwing', () => {
    expect(isPrivateNetworkOrigin('not a url')).toBe(false);
    expect(isPrivateNetworkOrigin('')).toBe(false);
  });
});
