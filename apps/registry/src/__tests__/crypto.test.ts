import { describe, expect, test } from 'bun:test';
import { verifyWithRawKey } from '@brika/registry';
import { generateKeys, publicKeyToBase64, signData } from '../crypto';

describe('generateKeys', () => {
  test('produces valid PEM keys and base64 raw public key', () => {
    const keys = generateKeys();
    expect(keys.privateKeyPem).toContain('BEGIN PRIVATE KEY');
    expect(keys.publicKeyPem).toContain('BEGIN PUBLIC KEY');
    expect(Buffer.from(keys.publicKeyBase64, 'base64')).toHaveLength(32);
  });
});

describe('signData + verifyWithRawKey', () => {
  test('round-trips correctly', () => {
    const keys = generateKeys();
    const data = 'hello, world';
    const sig = signData(data, keys.privateKeyPem);
    expect(verifyWithRawKey(data, sig, keys.publicKeyBase64)).toBe(true);
  });

  test('rejects tampered data', () => {
    const keys = generateKeys();
    const sig = signData('original', keys.privateKeyPem);
    expect(verifyWithRawKey('tampered', sig, keys.publicKeyBase64)).toBe(false);
  });

  test('rejects wrong key', () => {
    const keys1 = generateKeys();
    const keys2 = generateKeys();
    const sig = signData('data', keys1.privateKeyPem);
    expect(verifyWithRawKey('data', sig, keys2.publicKeyBase64)).toBe(false);
  });

  test('signature is hex-encoded (128 chars for Ed25519)', () => {
    const keys = generateKeys();
    const sig = signData('test', keys.privateKeyPem);
    expect(sig).toMatch(/^[0-9a-f]{128}$/);
  });
});

describe('publicKeyToBase64', () => {
  test('extracts matching raw key from PEM', () => {
    const keys = generateKeys();
    const extracted = publicKeyToBase64(keys.publicKeyPem);
    expect(extracted).toBe(keys.publicKeyBase64);
  });
});
