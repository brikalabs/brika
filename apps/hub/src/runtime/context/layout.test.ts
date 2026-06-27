import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveSystemDir } from '@brika/sdk/exec-context';
import { INTERNAL_ENTRIES, relocateLegacyLayout } from './layout';

let brikaDir: string;
let systemDir: string;

beforeEach(() => {
  brikaDir = mkdtempSync(join(tmpdir(), 'brika-layout-'));
  systemDir = resolveSystemDir(brikaDir);
});

afterEach(() => {
  rmSync(brikaDir, { recursive: true, force: true });
});

describe('relocateLegacyLayout', () => {
  test('moves internal entries into .system and leaves user files at the root', () => {
    // Internal: a file and a dir-with-contents.
    writeFileSync(join(brikaDir, 'instance.id'), 'deadbeef');
    mkdirSync(join(brikaDir, 'db'), { recursive: true });
    writeFileSync(join(brikaDir, 'db', 'state.db'), 'sqlite');
    // User-authored: must stay visible.
    writeFileSync(join(brikaDir, 'brika.yml'), 'hub: {}');
    mkdirSync(join(brikaDir, 'boards'), { recursive: true });
    writeFileSync(join(brikaDir, 'boards', 'home.yaml'), 'board: {}');

    relocateLegacyLayout(brikaDir, systemDir);

    // Internal entries moved under .system, with contents intact.
    expect(existsSync(join(brikaDir, 'instance.id'))).toBe(false);
    expect(readFileSync(join(systemDir, 'instance.id'), 'utf8')).toBe('deadbeef');
    expect(existsSync(join(brikaDir, 'db'))).toBe(false);
    expect(readFileSync(join(systemDir, 'db', 'state.db'), 'utf8')).toBe('sqlite');

    // User files untouched at the root, and NOT copied into .system.
    expect(readFileSync(join(brikaDir, 'brika.yml'), 'utf8')).toBe('hub: {}');
    expect(existsSync(join(brikaDir, 'boards', 'home.yaml'))).toBe(true);
    expect(existsSync(join(systemDir, 'brika.yml'))).toBe(false);
    expect(existsSync(join(systemDir, 'boards'))).toBe(false);
  });

  test('is a no-op on a fresh install (nothing to move, no .system created)', () => {
    writeFileSync(join(brikaDir, 'brika.yml'), 'hub: {}');

    relocateLegacyLayout(brikaDir, systemDir);

    expect(existsSync(systemDir)).toBe(false);
  });

  test('is idempotent and never overwrites an entry already in .system', () => {
    // A new-layout file already lives in .system; a stale root copy also exists.
    mkdirSync(systemDir, { recursive: true });
    writeFileSync(join(systemDir, 'instance.id'), 'newvalue');
    writeFileSync(join(brikaDir, 'instance.id'), 'stalevalue');

    relocateLegacyLayout(brikaDir, systemDir);

    // The .system copy is authoritative and untouched; the root copy is left
    // in place (the migration only moves into an empty slot).
    expect(readFileSync(join(systemDir, 'instance.id'), 'utf8')).toBe('newvalue');
    expect(existsSync(join(brikaDir, 'instance.id'))).toBe(true);

    // Running again changes nothing.
    relocateLegacyLayout(brikaDir, systemDir);
    expect(readFileSync(join(systemDir, 'instance.id'), 'utf8')).toBe('newvalue');
  });

  test('every internal entry name is a bare leaf (no path separators)', () => {
    for (const name of INTERNAL_ENTRIES) {
      expect(name).not.toContain('/');
      expect(name).not.toContain('\\');
    }
  });
});
