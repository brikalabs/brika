import { describe, expect, test } from 'bun:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { canonicalize, REGISTRY_PUBLIC_KEY, SPKI_HEADER, verifyWithRawKey } from '..';

// ─────────────────────────────────────────────────────────────────────────────
// canonicalize
// ─────────────────────────────────────────────────────────────────────────────

describe('canonicalize', () => {
  test('serializes primitives', () => {
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize(42)).toBe('42');
    expect(canonicalize('hello')).toBe('"hello"');
  });

  test('sorts object keys deterministically', () => {
    expect(canonicalize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(canonicalize({ z: 'z', a: 'a', m: 'm' })).toBe('{"a":"a","m":"m","z":"z"}');
  });

  test('strips undefined values', () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canonicalize({ x: undefined })).toBe('{}');
  });

  test('handles nested objects with sorted keys', () => {
    const input = { b: { d: 4, c: 3 }, a: 1 };
    expect(canonicalize(input)).toBe('{"a":1,"b":{"c":3,"d":4}}');
  });

  test('handles arrays preserving order', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
    expect(canonicalize(['b', 'a'])).toBe('["b","a"]');
  });

  test('handles arrays of objects', () => {
    const input = [{ b: 2, a: 1 }];
    expect(canonicalize(input)).toBe('[{"a":1,"b":2}]');
  });

  test('handles empty structures', () => {
    expect(canonicalize({})).toBe('{}');
    expect(canonicalize([])).toBe('[]');
  });

  test('produces identical output for equivalent inputs regardless of key order', () => {
    const a = { name: 'foo', version: '1.0', plugins: [{ id: 'bar' }] };
    const b = { plugins: [{ id: 'bar' }], version: '1.0', name: 'foo' };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SPKI_HEADER
// ─────────────────────────────────────────────────────────────────────────────

describe('SPKI_HEADER', () => {
  test('is 12 bytes (Ed25519 OID prefix)', () => {
    expect(SPKI_HEADER).toBeInstanceOf(Uint8Array);
    expect(SPKI_HEADER.length).toBe(12);
  });

  test('matches known Ed25519 SPKI DER prefix', () => {
    // ASN.1 DER: SEQUENCE { SEQUENCE { OID 1.3.101.112 }, BIT STRING (33 bytes) }
    expect(Array.from(SPKI_HEADER)).toEqual([48, 42, 48, 5, 6, 3, 43, 101, 112, 3, 33, 0]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY_PUBLIC_KEY
// ─────────────────────────────────────────────────────────────────────────────

describe('REGISTRY_PUBLIC_KEY', () => {
  test('is valid base64 decoding to 32 bytes', () => {
    const raw = Buffer.from(REGISTRY_PUBLIC_KEY, 'base64');
    expect(raw.length).toBe(32);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verifyWithRawKey
// ─────────────────────────────────────────────────────────────────────────────

describe('verifyWithRawKey', () => {
  // Generate a fresh test key pair for each run
  function makeTestKeyPair() {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const der = publicKey.export({ type: 'spki', format: 'der' });
    const rawBase64 = Buffer.from(der.subarray(SPKI_HEADER.length)).toString('base64');
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    return { pem, rawBase64 };
  }

  function signWithPem(data: string, pem: string): string {
    return sign(null, Buffer.from(data, 'utf-8'), pem).toString('hex');
  }

  test('verifies a valid signature', () => {
    const kp = makeTestKeyPair();
    const data = canonicalize({ name: 'test-plugin', version: '1.0.0' });
    const sig = signWithPem(data, kp.pem);
    expect(verifyWithRawKey(data, sig, kp.rawBase64)).toBe(true);
  });

  test('rejects tampered data', () => {
    const kp = makeTestKeyPair();
    const sig = signWithPem('original', kp.pem);
    expect(verifyWithRawKey('tampered', sig, kp.rawBase64)).toBe(false);
  });

  test('rejects wrong public key', () => {
    const kp1 = makeTestKeyPair();
    const kp2 = makeTestKeyPair();
    const sig = signWithPem('data', kp1.pem);
    expect(verifyWithRawKey('data', sig, kp2.rawBase64)).toBe(false);
  });

  test('rejects invalid signature hex', () => {
    const kp = makeTestKeyPair();
    expect(verifyWithRawKey('data', 'not-hex', kp.rawBase64)).toBe(false);
  });

  test('works with canonicalized JSON payload', () => {
    const kp = makeTestKeyPair();
    const payload = { z: 3, a: 1, m: 2 };
    const canonical = canonicalize(payload);
    const sig = signWithPem(canonical, kp.pem);
    expect(verifyWithRawKey(canonical, sig, kp.rawBase64)).toBe(true);
    // Same payload different key order → same canonical → same verification
    expect(verifyWithRawKey(canonicalize({ a: 1, m: 2, z: 3 }), sig, kp.rawBase64)).toBe(true);
  });
});
