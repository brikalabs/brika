/**
 * Minisign verification tests.
 *
 * We don't ship a test keypair — generating Ed25519 keys at test time
 * is the cleanest way to exercise the full code path without leaking
 * a "test secret key" file into the repo. Each test generates a fresh
 * pair, signs known content with our own implementation, and verifies
 * `verifyMinisignFile` against it.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyMinisignFile } from './signature';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'brika-sig-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface KeyPair {
  pubkeyB64: string;
  spki: Buffer;
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'];
}

function generateEd25519(): KeyPair {
  const pair = generateKeyPairSync('ed25519');
  const spki = pair.publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  // Strip the 12-byte SPKI prefix to get the raw 32-byte key.
  const raw = spki.subarray(12);
  return {
    pubkeyB64: raw.toString('base64'),
    spki,
    privateKey: pair.privateKey,
  };
}

function makeSigFile(
  payloadPath: string,
  keys: KeyPair,
  opts?: { tamperGlobal?: boolean; tamperPayload?: boolean }
): string {
  const payload = require('node:fs').readFileSync(payloadPath) as Buffer;
  const hashed = createHash('blake2b512').update(payload).digest();
  // Sign hashed (Ed mode); tamper if requested.
  const sig = sign(null, opts?.tamperPayload === true ? Buffer.from('x') : hashed, keys.privateKey);
  // Algo prefix "Ed" + 8-byte key ID + 64-byte sig
  const algo = Buffer.from('Ed', 'ascii');
  const keyId = Buffer.alloc(8); // arbitrary; not checked
  const sigBlob = Buffer.concat([algo, keyId, sig]);

  const trustedComment = 'release brika v0.6.0';
  const globalMessage = Buffer.concat([sig, Buffer.from(trustedComment, 'utf8')]);
  const globalSig = sign(
    null,
    opts?.tamperGlobal === true ? Buffer.from('x') : globalMessage,
    keys.privateKey
  );

  const sigFile = `untrusted comment: signed by minisign\n${sigBlob.toString('base64')}\ntrusted comment: ${trustedComment}\n${globalSig.toString('base64')}\n`;
  const sigPath = `${payloadPath}.minisig`;
  writeFileSync(sigPath, sigFile);
  return sigPath;
}

describe('verifyMinisignFile', () => {
  test("returns 'skipped' when no pubkey is embedded", async () => {
    const payload = join(dir, 'payload');
    writeFileSync(payload, 'hello');
    const result = await verifyMinisignFile(payload, '/nonexistent', '');
    expect(result.status).toBe('skipped');
  });

  test('verifies a correctly signed payload', async () => {
    const payload = join(dir, 'payload');
    writeFileSync(payload, 'real release bytes');
    const keys = generateEd25519();
    const sigPath = makeSigFile(payload, keys);
    const result = await verifyMinisignFile(payload, sigPath, keys.pubkeyB64);
    expect(result.status).toBe('verified');
  });

  test('rejects a tampered global signature', async () => {
    const payload = join(dir, 'payload');
    writeFileSync(payload, 'bytes');
    const keys = generateEd25519();
    const sigPath = makeSigFile(payload, keys, { tamperGlobal: true });
    const result = await verifyMinisignFile(payload, sigPath, keys.pubkeyB64);
    expect(result.status).toBe('failed');
  });

  test('rejects a tampered payload signature', async () => {
    const payload = join(dir, 'payload');
    writeFileSync(payload, 'bytes');
    const keys = generateEd25519();
    const sigPath = makeSigFile(payload, keys, { tamperPayload: true });
    const result = await verifyMinisignFile(payload, sigPath, keys.pubkeyB64);
    expect(result.status).toBe('failed');
  });

  test('rejects when the payload bytes are modified after signing', async () => {
    const payload = join(dir, 'payload');
    writeFileSync(payload, 'original');
    const keys = generateEd25519();
    const sigPath = makeSigFile(payload, keys);
    writeFileSync(payload, 'tampered');
    const result = await verifyMinisignFile(payload, sigPath, keys.pubkeyB64);
    expect(result.status).toBe('failed');
  });

  test('rejects with the wrong pubkey', async () => {
    const payload = join(dir, 'payload');
    writeFileSync(payload, 'bytes');
    const signing = generateEd25519();
    const sigPath = makeSigFile(payload, signing);
    const other = generateEd25519();
    const result = await verifyMinisignFile(payload, sigPath, other.pubkeyB64);
    expect(result.status).toBe('failed');
  });

  test('reports failure when the signature file is missing', async () => {
    const payload = join(dir, 'payload');
    writeFileSync(payload, 'bytes');
    const keys = generateEd25519();
    const result = await verifyMinisignFile(payload, join(dir, 'absent.minisig'), keys.pubkeyB64);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toMatch(/unreadable/);
    }
  });
});
