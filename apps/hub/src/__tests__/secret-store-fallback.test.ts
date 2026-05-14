/**
 * SecretStore auto-fallback — when Bun.secrets throws
 * `ERR_SECRETS_PLATFORM_ERROR` (no Secret Service on this host), the store
 * must transparently switch to the encrypted file backend and continue
 * working. This is the path that lights up in the Docker image.
 */

import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get, reset } from '@brika/di/testing';
import { SecretStore } from '@/runtime/secrets/secret-store';

interface EnvSnapshot {
  readonly BRIKA_HOME: string | undefined;
  readonly BRIKA_SECRET_KEY: string | undefined;
  readonly BRIKA_SECRETS_BACKEND: string | undefined;
}

function snapshotEnv(): EnvSnapshot {
  return {
    BRIKA_HOME: process.env.BRIKA_HOME,
    BRIKA_SECRET_KEY: process.env.BRIKA_SECRET_KEY,
    BRIKA_SECRETS_BACKEND: process.env.BRIKA_SECRETS_BACKEND,
  };
}

function restoreEnv(snap: EnvSnapshot): void {
  for (const key of ['BRIKA_HOME', 'BRIKA_SECRET_KEY', 'BRIKA_SECRETS_BACKEND'] as const) {
    if (snap[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = snap[key];
    }
  }
}

function platformError(): Error {
  return Object.assign(new Error('libsecret not available'), {
    code: 'ERR_SECRETS_PLATFORM_ERROR',
  });
}

describe('SecretStore auto-fallback', () => {
  let dir: string;
  let env: EnvSnapshot;
  const spies: { mockRestore(): void }[] = [];

  beforeEach(() => {
    env = snapshotEnv();
    dir = mkdtempSync(join(tmpdir(), 'brika-fallback-'));
    process.env.BRIKA_HOME = dir;
    process.env.BRIKA_SECRET_KEY = randomBytes(32).toString('base64');
    delete process.env.BRIKA_SECRETS_BACKEND; // 'auto'
    reset();
  });

  afterEach(() => {
    for (const spy of spies) {
      spy.mockRestore();
    }
    spies.length = 0;
    rmSync(dir, { recursive: true, force: true });
    restoreEnv(env);
    reset();
  });

  test('swaps to the file backend on ERR_SECRETS_PLATFORM_ERROR and continues working', async () => {
    const getSpy = spyOn(Bun.secrets, 'get').mockImplementation(() =>
      Promise.reject(platformError())
    );
    const setSpy = spyOn(Bun.secrets, 'set').mockImplementation(() =>
      Promise.reject(platformError())
    );
    const deleteSpy = spyOn(Bun.secrets, 'delete').mockImplementation(() =>
      Promise.reject(platformError())
    );
    spies.push(getSpy, setSpy, deleteSpy);

    const store = get(SecretStore);

    // First write triggers the probe → fall back to FileBackend.
    await store.set('@plugin', 'token', 'value');
    expect(setSpy).toHaveBeenCalledTimes(1);

    // Subsequent operations go straight to the file backend — Bun.secrets
    // is never called again.
    expect(await store.get('@plugin', 'token')).toBe('value');
    expect(getSpy).not.toHaveBeenCalled();

    expect(await store.delete('@plugin', 'token')).toBe(true);
    expect(await store.get('@plugin', 'token')).toBeNull();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  test('non-platform errors are not swallowed in auto mode', async () => {
    const setSpy = spyOn(Bun.secrets, 'set').mockImplementation(() =>
      Promise.reject(new Error('something else went wrong'))
    );
    spies.push(setSpy);

    const store = get(SecretStore);
    await expect(store.set('@plugin', 'k', 'v')).rejects.toThrow('something else went wrong');
  });

  test('explicit BRIKA_SECRETS_BACKEND=file skips the keychain entirely', async () => {
    process.env.BRIKA_SECRETS_BACKEND = 'file';
    reset();

    const getSpy = spyOn(Bun.secrets, 'get').mockImplementation(() => Promise.resolve(null));
    spies.push(getSpy);

    const store = get(SecretStore);
    await store.set('@plugin', 'k', 'v');
    expect(await store.get('@plugin', 'k')).toBe('v');
    expect(getSpy).not.toHaveBeenCalled();
  });

  test('invalid BRIKA_SECRETS_BACKEND throws at construction', () => {
    process.env.BRIKA_SECRETS_BACKEND = 'wat';
    reset();
    expect(() => get(SecretStore)).toThrow(/Invalid BRIKA_SECRETS_BACKEND/);
  });
});
