/**
 * FileBackend — AES-256-GCM encrypted file store used in headless deployments.
 *
 * Each test gets its own scratch directory under `os.tmpdir()` to avoid
 * touching the real `${BRIKA_HOME}`. Master keys are injected directly so the
 * tests don't read/write env vars (which would be racy across files).
 */

import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileBackend, resolveMasterKey } from '@/runtime/secrets/backends/file-backend';

const REF = (name: string) => ({ service: 'test.service', name });

describe('FileBackend', () => {
  let dir: string;
  let key: Buffer;
  let backend: FileBackend;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'brika-secrets-'));
    key = randomBytes(32);
    backend = new FileBackend({ brikaDir: dir, masterKey: key });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('round-trips a value', async () => {
    await backend.set({ ...REF('apiKey'), value: 'sk-abc' });
    expect(await backend.get(REF('apiKey'))).toBe('sk-abc');
  });

  test('returns null when missing', async () => {
    expect(await backend.get(REF('missing'))).toBeNull();
  });

  test('isolates entries by (service, name) pair', async () => {
    await backend.set({ service: 'svc-a', name: 'k', value: 'A' });
    await backend.set({ service: 'svc-b', name: 'k', value: 'B' });
    expect(await backend.get({ service: 'svc-a', name: 'k' })).toBe('A');
    expect(await backend.get({ service: 'svc-b', name: 'k' })).toBe('B');
  });

  test('delete returns true when entry existed', async () => {
    await backend.set({ ...REF('k'), value: 'v' });
    expect(await backend.delete(REF('k'))).toBe(true);
    expect(await backend.get(REF('k'))).toBeNull();
  });

  test('delete returns false when entry did not exist', async () => {
    expect(await backend.delete(REF('missing'))).toBe(false);
  });

  test('overwrites on repeat set', async () => {
    await backend.set({ ...REF('k'), value: 'first' });
    await backend.set({ ...REF('k'), value: 'second' });
    expect(await backend.get(REF('k'))).toBe('second');
  });

  // ─── Security ────────────────────────────────────────────────────────────

  test('ciphertext on disk does not contain the plaintext', async () => {
    await backend.set({ ...REF('credential'), value: 'super-secret-password' });
    const file = readFileSync(join(dir, 'secrets.json'), 'utf8');
    expect(file).not.toContain('super-secret-password');
  });

  test('decryption with the wrong key throws (no silent corruption)', async () => {
    await backend.set({ ...REF('k'), value: 'v' });
    const wrongKey = new FileBackend({ brikaDir: dir, masterKey: randomBytes(32) });
    await expect(wrongKey.get(REF('k'))).rejects.toThrow();
  });

  test('decryption survives a fresh backend instance with the same key', async () => {
    await backend.set({ ...REF('k'), value: 'v' });
    const reopened = new FileBackend({ brikaDir: dir, masterKey: key });
    expect(await reopened.get(REF('k'))).toBe('v');
  });

  test('two encryptions of the same plaintext produce different ciphertexts', async () => {
    await backend.set({ ...REF('a'), value: 'same-plaintext' });
    await backend.set({ ...REF('b'), value: 'same-plaintext' });
    const file: { entries: Record<string, string> } = JSON.parse(
      readFileSync(join(dir, 'secrets.json'), 'utf8')
    );
    const blobs = Object.values(file.entries);
    expect(blobs).toHaveLength(2);
    expect(blobs[0]).not.toBe(blobs[1]);
  });

  test('tampering with the ciphertext is rejected by the auth tag', async () => {
    await backend.set({ ...REF('k'), value: 'original' });
    const path = join(dir, 'secrets.json');
    const file: { version: number; entries: Record<string, string> } = JSON.parse(
      readFileSync(path, 'utf8')
    );
    const [refKey, blob] = Object.entries(file.entries)[0];
    // Flip a byte deep inside the ciphertext (not the IV).
    const bytes = Buffer.from(blob, 'base64');
    bytes[20] ^= 0xff;
    file.entries[refKey] = bytes.toString('base64');
    writeFileSync(path, JSON.stringify(file));
    await expect(backend.get(REF('k'))).rejects.toThrow();
  });

  test('secrets.json is written with 0600 permissions', async () => {
    if (process.platform === 'win32') {
      return; // POSIX modes are not meaningful on Windows.
    }
    await backend.set({ ...REF('k'), value: 'v' });
    const mode = statSync(join(dir, 'secrets.json')).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test('rejects a malformed payload', async () => {
    writeFileSync(join(dir, 'secrets.json'), 'not json{');
    await expect(backend.get(REF('k'))).rejects.toThrow();
  });

  test('rejects an unsupported version', async () => {
    writeFileSync(join(dir, 'secrets.json'), JSON.stringify({ version: 999, entries: {} }));
    await expect(backend.get(REF('k'))).rejects.toThrow(/unsupported version/);
  });

  // ─── Concurrency ─────────────────────────────────────────────────────────

  test('parallel writes never lose entries', async () => {
    const writes = Array.from({ length: 50 }, (_, i) =>
      backend.set({ ...REF(`k${i}`), value: `v${i}` })
    );
    await Promise.all(writes);
    for (let i = 0; i < 50; i++) {
      expect(await backend.get(REF(`k${i}`))).toBe(`v${i}`);
    }
  });
});

describe('resolveMasterKey', () => {
  let dir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'brika-key-'));
    originalEnv = process.env.BRIKA_SECRET_KEY;
    delete process.env.BRIKA_SECRET_KEY;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (originalEnv === undefined) {
      delete process.env.BRIKA_SECRET_KEY;
    } else {
      process.env.BRIKA_SECRET_KEY = originalEnv;
    }
  });

  test('uses BRIKA_SECRET_KEY env var when set', () => {
    const expected = randomBytes(32);
    process.env.BRIKA_SECRET_KEY = expected.toString('base64');
    const resolved = resolveMasterKey(dir);
    expect(Buffer.compare(resolved, expected)).toBe(0);
  });

  test('rejects an env key of wrong length', () => {
    process.env.BRIKA_SECRET_KEY = Buffer.from('too-short').toString('base64');
    expect(() => resolveMasterKey(dir)).toThrow(/32 bytes/);
  });

  test('generates and persists a key file on first run with 0600 perms', () => {
    const key = resolveMasterKey(dir);
    expect(key.length).toBe(32);
    const path = join(dir, 'master.key');
    const saved = readFileSync(path);
    expect(Buffer.compare(saved, key)).toBe(0);
    if (process.platform !== 'win32') {
      expect(statSync(path).mode & 0o777).toBe(0o600);
    }
  });

  test('rereads the same key on a second call', () => {
    const first = resolveMasterKey(dir);
    const second = resolveMasterKey(dir);
    expect(Buffer.compare(first, second)).toBe(0);
  });

  test('refuses an existing key file with insecure permissions', () => {
    if (process.platform === 'win32') {
      return;
    }
    const path = join(dir, 'master.key');
    writeFileSync(path, randomBytes(32), { mode: 0o644 });
    expect(() => resolveMasterKey(dir)).toThrow(/insecure permissions/);
  });

  test('refuses a corrupt key file', () => {
    if (process.platform === 'win32') {
      return;
    }
    const path = join(dir, 'master.key');
    writeFileSync(path, Buffer.from('short'), { mode: 0o600 });
    expect(() => resolveMasterKey(dir)).toThrow(/corrupt/);
  });
});
