/**
 * `readCliToken` round-trip — uses a `BRIKA_HOME` override pointing at
 * a tmpdir so we exercise the real filesystem without touching the
 * user's actual `.brika`.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCliToken } from './auth-token';

describe('readCliToken', () => {
  let home: string;
  let original: string | undefined;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'brika-cli-token-'));
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
    writeFileSync(join(home, 'cli-token'), '  deadbeef  \n', 'utf8');
    expect(readCliToken()).toBe('deadbeef');
  });

  test('returns null for an empty file', () => {
    writeFileSync(join(home, 'cli-token'), '   \n', 'utf8');
    expect(readCliToken()).toBeNull();
  });
});
