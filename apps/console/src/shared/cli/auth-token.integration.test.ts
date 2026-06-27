/**
 * Round-trip the local-trust CLI token through the real filesystem,
 * pointed at a tmpdir via `BRIKA_HOME` so we don't touch the user's
 * actual `.brika/`.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCliToken, removeCliToken, writeCliToken } from './auth-token';

describe('cli-token', () => {
  let home: string;
  let original: string | undefined;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'brika-cli-token-'));
    // The cli-token lives under the hidden .system/ dir.
    mkdirSync(join(home, '.system'), { recursive: true });
    original = process.env.BRIKA_HOME;
    process.env.BRIKA_HOME = home;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.BRIKA_HOME;
    } else {
      process.env.BRIKA_HOME = original;
    }
    rmSync(home, { recursive: true, force: true });
  });

  test('returns null when the token file is missing', () => {
    expect(readCliToken()).toBeNull();
  });

  test('returns the trimmed token contents when the file exists', () => {
    writeFileSync(join(home, '.system', 'cli-token'), '  deadbeef  \n', 'utf8');
    expect(readCliToken()).toBe('deadbeef');
  });

  test('returns null for an empty file', () => {
    writeFileSync(join(home, '.system', 'cli-token'), '   \n', 'utf8');
    expect(readCliToken()).toBeNull();
  });

  test('writeCliToken creates a 64-hex token at 0600 perms', () => {
    const token = writeCliToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(readCliToken()).toBe(token);
    if (process.platform !== 'win32') {
      const mode = statSync(join(home, '.system', 'cli-token')).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });

  test('writeCliToken creates BRIKA_HOME if missing', () => {
    rmSync(home, { recursive: true, force: true });
    writeCliToken();
    expect(existsSync(join(home, '.system', 'cli-token'))).toBe(true);
  });

  test('writeCliToken regenerates a fresh token on every call', () => {
    const a = writeCliToken();
    const b = writeCliToken();
    expect(a).not.toBe(b);
    expect(readCliToken()).toBe(b);
  });

  test('removeCliToken deletes the file and is idempotent', () => {
    writeCliToken();
    removeCliToken();
    expect(existsSync(join(home, '.system', 'cli-token'))).toBe(false);
    expect(() => removeCliToken()).not.toThrow();
  });
});
