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
import { createHash, generateKeyPairSync, type KeyObject, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  privateKey: KeyObject;
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
  opts?: { tamperGlobal?: boolean; tamperPayload?: boolean; mode?: 'hashed' | 'legacy' }
): string {
  const payload = readFileSync(payloadPath);
  const mode = opts?.mode ?? 'hashed';
  const signedMessage =
    mode === 'hashed' ? createHash('blake2b512').update(payload).digest() : payload;
  // Tamper if requested — replace the signed message with garbage.
  const payloadMessage = opts?.tamperPayload === true ? Buffer.from('x') : signedMessage;
  const sig = sign(null, payloadMessage, keys.privateKey);
  // Algo prefix: "ED" = hashed (minisign default since 0.10), "Ed" = legacy.
  const algo = Buffer.from(mode === 'hashed' ? 'ED' : 'Ed', 'ascii');
  const keyId = Buffer.alloc(8); // arbitrary; not checked
  const sigBlob = Buffer.concat([algo, keyId, sig]);

  const trustedComment = 'release brika v0.6.0';
  const globalMessage = Buffer.concat([sig, Buffer.from(trustedComment, 'utf8')]);
  const globalMessageOrTampered = opts?.tamperGlobal === true ? Buffer.from('x') : globalMessage;
  const globalSig = sign(null, globalMessageOrTampered, keys.privateKey);

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

  test('rejects when the pubkey is the wrong length', async () => {
    const payload = join(dir, 'payload');
    writeFileSync(payload, 'bytes');
    const keys = generateEd25519();
    // Valid-shape signature so we get past the parser and reach the
    // pubkey-length check.
    const sigPath = makeSigFile(payload, keys);
    // 16-byte (truncated) base64 pubkey
    const shortPubkey = Buffer.alloc(16, 1).toString('base64');
    const result = await verifyMinisignFile(payload, sigPath, shortPubkey);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toMatch(/pubkey must be 32 bytes/);
    }
  });

  test('rejects when the signature file has fewer than 4 lines', async () => {
    const payload = join(dir, 'payload');
    writeFileSync(payload, 'bytes');
    const sigPath = join(dir, 's.minisig');
    writeFileSync(sigPath, 'untrusted comment: only\nAAAA\n');
    const keys = generateEd25519();
    const result = await verifyMinisignFile(payload, sigPath, keys.pubkeyB64);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toMatch(/expected 4 lines/);
    }
  });

  test('rejects when the signature-line length is wrong', async () => {
    const payload = join(dir, 'payload');
    writeFileSync(payload, 'bytes');
    const sigPath = join(dir, 's.minisig');
    // Second line decodes to <74 bytes (right shape would be 2+8+64).
    writeFileSync(
      sigPath,
      `untrusted comment: x\n${Buffer.alloc(10).toString('base64')}\ntrusted comment: y\n${Buffer.alloc(64).toString('base64')}\n`
    );
    const keys = generateEd25519();
    const result = await verifyMinisignFile(payload, sigPath, keys.pubkeyB64);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toMatch(/signature line wrong length/);
    }
  });

  test('accepts a legacy "Ed" minisign signature (signs raw file bytes)', async () => {
    // `minisign -S -l` opts into legacy mode; we still accept it
    // because both modes use Ed25519 over a 64-byte message and are
    // equally secure — see signature.ts header comment.
    const payload = join(dir, 'payload');
    writeFileSync(payload, 'legacy mode payload');
    const keys = generateEd25519();
    const sigPath = makeSigFile(payload, keys, { mode: 'legacy' });
    const result = await verifyMinisignFile(payload, sigPath, keys.pubkeyB64);
    expect(result.status).toBe('verified');
  });

  test('rejects an unknown algorithm prefix', async () => {
    const payload = join(dir, 'payload');
    writeFileSync(payload, 'bytes');
    const sigPath = join(dir, 's.minisig');
    const unknownBlob = Buffer.concat([
      Buffer.from('XX', 'ascii'), // neither "ED" (hashed) nor "Ed" (legacy)
      Buffer.alloc(8),
      Buffer.alloc(64),
    ]);
    writeFileSync(
      sigPath,
      `untrusted comment: x\n${unknownBlob.toString('base64')}\ntrusted comment: y\n${Buffer.alloc(64).toString('base64')}\n`
    );
    const keys = generateEd25519();
    const result = await verifyMinisignFile(payload, sigPath, keys.pubkeyB64);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toMatch(/unsupported minisign algorithm/);
    }
  });

  test('rejects when the trusted-comment line is missing', async () => {
    const payload = join(dir, 'payload');
    writeFileSync(payload, 'bytes');
    const sigPath = join(dir, 's.minisig');
    const validBlob = Buffer.concat([
      Buffer.from('ED', 'ascii'), // hashed mode marker
      Buffer.alloc(8),
      Buffer.alloc(64),
    ]);
    writeFileSync(
      sigPath,
      `untrusted comment: x\n${validBlob.toString('base64')}\nNOT THE PREFIX: y\n${Buffer.alloc(64).toString('base64')}\n`
    );
    const keys = generateEd25519();
    const result = await verifyMinisignFile(payload, sigPath, keys.pubkeyB64);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toMatch(/missing "trusted comment:" line/);
    }
  });

  test('rejects when the global signature has the wrong length', async () => {
    const payload = join(dir, 'payload');
    writeFileSync(payload, 'bytes');
    const sigPath = join(dir, 's.minisig');
    const validBlob = Buffer.concat([
      Buffer.from('ED', 'ascii'), // hashed mode marker
      Buffer.alloc(8),
      Buffer.alloc(64),
    ]);
    // Global sig truncated.
    writeFileSync(
      sigPath,
      `untrusted comment: x\n${validBlob.toString('base64')}\ntrusted comment: y\n${Buffer.alloc(16).toString('base64')}\n`
    );
    const keys = generateEd25519();
    const result = await verifyMinisignFile(payload, sigPath, keys.pubkeyB64);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toMatch(/global signature wrong length/);
    }
  });

  test('binds a valid signature to the expected version and asset', async () => {
    // The trusted comment baked into `makeSigFile` is "release brika v0.6.0".
    const payload = join(dir, 'brika-linux-x64.tar.gz');
    writeFileSync(payload, 'release bytes');
    const keys = generateEd25519();
    const sigPath = makeSigFile(payload, keys);
    const result = await verifyMinisignFile(payload, sigPath, keys.pubkeyB64, {
      version: 'v0.6.0',
      asset: 'brika',
    });
    expect(result.status).toBe('verified');
  });

  test('rejects when the trusted comment does not name the expected version', async () => {
    // A signature legitimately signed for v0.6.0 must not verify against a
    // request that expects v9.9.9 — defeats a re-point/downgrade between two
    // genuinely-signed releases.
    const payload = join(dir, 'payload');
    writeFileSync(payload, 'bytes');
    const keys = generateEd25519();
    const sigPath = makeSigFile(payload, keys);
    const result = await verifyMinisignFile(payload, sigPath, keys.pubkeyB64, {
      version: '9.9.9',
      asset: 'brika',
    });
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toMatch(/does not bind expected version/);
    }
  });

  test('rejects when the trusted comment does not name the expected asset', async () => {
    const payload = join(dir, 'payload');
    writeFileSync(payload, 'bytes');
    const keys = generateEd25519();
    const sigPath = makeSigFile(payload, keys);
    const result = await verifyMinisignFile(payload, sigPath, keys.pubkeyB64, {
      version: 'v0.6.0',
      asset: 'some-other-artifact.zip',
    });
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.reason).toMatch(
        /does not bind expected version.*asset some-other-artifact\.zip/
      );
    }
  });

  test('strips a leading "v" from the expected version before matching', async () => {
    // CI tags are `vX.Y.Z` but the trusted comment carries the bare version;
    // the binder strips the `v` so both spellings match.
    const payload = join(dir, 'payload');
    writeFileSync(payload, 'bytes');
    const keys = generateEd25519();
    const sigPath = makeSigFile(payload, keys);
    const result = await verifyMinisignFile(payload, sigPath, keys.pubkeyB64, {
      version: 'v0.6.0',
      asset: 'brika',
    });
    expect(result.status).toBe('verified');
  });

  test('normalises CRLF in the signature file', async () => {
    // A signature file that traveled through a Windows editor or a
    // misconfigured HTTP server with `--text` translation should
    // still verify — we strip the trailing `\r` before parsing.
    const payload = join(dir, 'payload');
    writeFileSync(payload, 'crlf-test');
    const keys = generateEd25519();
    const sigPath = makeSigFile(payload, keys);
    const crlfContent = readFileSync(sigPath, 'utf8').replaceAll('\n', '\r\n');
    writeFileSync(sigPath, crlfContent);
    const result = await verifyMinisignFile(payload, sigPath, keys.pubkeyB64);
    expect(result.status).toBe('verified');
  });
});
