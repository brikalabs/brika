/**
 * Boot-rollback tests.
 *
 * Pure path-driven via `checkAndRollback`: every test points it at a
 * fresh temp `${installDir}` and a fresh `${brikaDir}` so we can
 * exercise each outcome (no-backup / cleared-backup / rolled-back)
 * without touching the real filesystem layout.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkAndRollback } from './boot-rollback';
import { liveBinaryPath, previousBinaryPath } from './staged-install';
import { VersionStateStore } from './version-state';

let installDir: string;
let brikaDir: string;

beforeEach(() => {
  installDir = mkdtempSync(join(tmpdir(), 'brika-rb-install-'));
  brikaDir = mkdtempSync(join(tmpdir(), 'brika-rb-data-'));
});

afterEach(() => {
  rmSync(installDir, { recursive: true, force: true });
  rmSync(brikaDir, { recursive: true, force: true });
});

function writeBinary(path: string, content: string): void {
  writeFileSync(path, content);
}

describe('checkAndRollback', () => {
  test("returns 'no-backup' when no .previous exists (typical case)", () => {
    writeBinary(liveBinaryPath(installDir), 'live');
    expect(checkAndRollback({ brikaDir, installDir })).toBe('no-backup');
  });

  test("returns 'cleared-backup' after a clean boot — the rollback window is closed", () => {
    writeBinary(liveBinaryPath(installDir), 'live');
    writeBinary(previousBinaryPath(installDir), 'previous');
    const vs = new VersionStateStore(brikaDir, '0.6.0');
    vs.recordBootAttempt();
    vs.recordBootSuccess(); // boot succeeded → no crash flag

    expect(checkAndRollback({ brikaDir, installDir })).toBe('cleared-backup');
    expect(existsSync(previousBinaryPath(installDir))).toBe(false);
  });

  test("returns 'rolled-back' and swaps binaries when previous boot crashed", () => {
    writeBinary(liveBinaryPath(installDir), 'broken-new');
    writeBinary(previousBinaryPath(installDir), 'known-good');
    const vs = new VersionStateStore(brikaDir, '0.6.0');
    vs.recordBootAttempt(); // attempted but never recorded success → crash

    let exitCalls = 0;
    const fakeExit = (() => {
      exitCalls += 1;
      // Don't actually throw — the production path exits the process,
      // but we want to inspect post-rename state.
      return undefined as never;
    }) as (code: number) => never;

    const outcome = checkAndRollback({ brikaDir, installDir, exit: fakeExit });

    expect(outcome).toBe('rolled-back');
    expect(exitCalls).toBe(1);
    // Live binary is now the known-good content; previous is gone.
    expect(readFileSync(liveBinaryPath(installDir), 'utf8')).toBe('known-good');
    expect(existsSync(previousBinaryPath(installDir))).toBe(false);
    // Broken one stashed at `${live}.broken` for post-mortem.
    expect(existsSync(`${liveBinaryPath(installDir)}.broken`)).toBe(true);
  });

  test('rollback failure (no live binary) audits "rollback-failed" and returns no-backup', () => {
    // .previous present, live missing → renameSync(live, broken) will fail.
    writeBinary(previousBinaryPath(installDir), 'known-good');
    const vs = new VersionStateStore(brikaDir, '0.6.0');
    vs.recordBootAttempt();

    const outcome = checkAndRollback({
      brikaDir,
      installDir,
      exit: (() => undefined as never) as (code: number) => never,
    });
    expect(outcome).toBe('no-backup');
  });

  test('after rollback, version-state records the swap in updateHistory', () => {
    writeBinary(liveBinaryPath(installDir), 'broken');
    writeBinary(previousBinaryPath(installDir), 'good');
    const vs = new VersionStateStore(brikaDir, '0.6.0');
    vs.recordBootAttempt();

    checkAndRollback({
      brikaDir,
      installDir,
      exit: (() => undefined as never) as (code: number) => never,
    });

    const after = new VersionStateStore(brikaDir, '0.6.0');
    const last = after.snapshot.updateHistory.at(-1);
    expect(last?.status).toBe('rolled-back');
  });
});
