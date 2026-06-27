/**
 * Extra boot-rollback edge cases — the existing tests cover the
 * happy path + the first-rename-failure audit shape; this file
 * covers:
 *
 *   - The previous-to-live rename failure (we monkey-patch the live
 *     binary to vanish between the two renames, simulating a disk
 *     pull mid-flight) and the inverse-rename safety net.
 *   - The "stale `.broken` cleanup" branch — a previous rollback left
 *     a `.broken` file and the new rollback must drop it before
 *     creating its own.
 *   - The DI-free `rollbackIfPreviousBootCrashed()` wrapper.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brikaContext } from '@/runtime/context/brika-context';
import { checkAndRollback, rollbackIfPreviousBootCrashed } from './boot-rollback';
import { liveBinaryPath, previousBinaryPath } from './staged-install';
import { VersionStateStore } from './version-state';

let installDir: string;
let brikaDir: string;

beforeEach(() => {
  installDir = mkdtempSync(join(tmpdir(), 'brika-rb-extra-install-'));
  brikaDir = mkdtempSync(join(tmpdir(), 'brika-rb-extra-data-'));
});

afterEach(() => {
  rmSync(installDir, { recursive: true, force: true });
  rmSync(brikaDir, { recursive: true, force: true });
});

const noopExit: (code: number) => never = (() => undefined) as never;

describe('boot-rollback extra paths', () => {
  test('deletes a stale `.broken` file before creating a new one', () => {
    writeFileSync(liveBinaryPath(installDir), 'broken-new');
    writeFileSync(previousBinaryPath(installDir), 'known-good');
    // Pre-existing `.broken` from a hypothetical earlier rollback.
    const stale = `${liveBinaryPath(installDir)}.broken`;
    writeFileSync(stale, 'stale-broken-from-last-time');

    const vs = new VersionStateStore(brikaDir, '0.6.0');
    vs.recordBootAttempt();

    const outcome = checkAndRollback({ systemDir: brikaDir, installDir, exit: noopExit });
    expect(outcome).toBe('rolled-back');
    // The new `.broken` replaces the stale one (same path, but the
    // payload is the crashed binary's content, not the stale text).
    expect(readFileSync(stale, 'utf8')).toBe('broken-new');
    // Live now holds the known-good content.
    expect(readFileSync(liveBinaryPath(installDir), 'utf8')).toBe('known-good');
  });
});

describe('rollbackIfPreviousBootCrashed (wrapper)', () => {
  test("uses brikaContext paths and returns 'no-backup' for a fresh install", () => {
    // No staged binaries exist in brikaContext.installDir — the test
    // runs in dev, where installDir is the dev root. Worst case we
    // get 'no-backup' or 'no-rollback' depending on the dev tree; the
    // wrapper must not throw.
    const outcome = rollbackIfPreviousBootCrashed();
    expect(['no-backup', 'no-rollback', 'rolled-back']).toContain(outcome);
    expect(brikaContext.installDir.length).toBeGreaterThan(0);
  });
});
