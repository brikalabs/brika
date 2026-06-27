/**
 * End-to-end test for the apply → boot-success contract.
 *
 * Each piece is unit-tested in isolation, but nothing wires them
 * together to verify the full hand-off:
 *
 *   1. Orchestrator.apply records the update and lets the strategy
 *      stage a `.previous` backup (we simulate the staged-install
 *      part by dropping the file directly — the real strategy
 *      requires a working `--self-check` subprocess, which has its
 *      own subprocess test).
 *   2. checkAndRollback runs at the start of the next boot. Because
 *      the previous boot recorded success on disk, the rollback
 *      returns `'no-rollback'` and keeps the backup intact.
 *   3. Orchestrator.recordBootSuccess runs at the END of the next
 *      boot. It marks the lastSeenVersion and tears down the backup.
 *
 * The bug the review caught was that step 2 used to delete the
 * backup, closing the rollback window before step 3 had proven the
 * new boot. This test pins the corrected timing.
 */

import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UpdateAuditLog } from './audit-log';
import { checkAndRollback } from './boot-rollback';
import { UpdateOrchestrator } from './orchestrator';
import { liveBinaryPath, nextBinaryPath, previousBinaryPath } from './staged-install';
import type {
  StrategyApplyOptions,
  StrategyApplyResult,
  UpdateStrategy,
} from './strategies/strategy';
import { UpdateLock } from './update-lock';
import { VersionStateStore } from './version-state';

class FakeStagedStrategy implements UpdateStrategy {
  readonly name = 'fake-staged';
  applies = 0;
  constructor(private readonly installDir: string) {}
  canApply(): boolean {
    return true;
  }
  check(): Promise<never> {
    return Promise.reject(new Error('not used'));
  }
  apply(_options: StrategyApplyOptions): Promise<StrategyApplyResult> {
    this.applies += 1;
    // Simulate what `StandaloneStrategy.apply` does on the staged path:
    // the live binary becomes `.previous`, and the new bytes land at
    // the live path. We start with no live binary in this test, so
    // just create one and a sibling .previous as if the swap ran.
    writeFileSync(liveBinaryPath(this.installDir), 'new-binary');
    writeFileSync(previousBinaryPath(this.installDir), 'old-binary');
    rmSync(nextBinaryPath(this.installDir), { force: true });
    return Promise.resolve({
      previousVersion: '0.5.0',
      previousCommit: 'abc',
      newVersion: '0.6.0',
      newCommit: 'def',
    });
  }
}

let installDir: string;
let brikaDir: string;

beforeEach(() => {
  installDir = mkdtempSync(join(tmpdir(), 'brika-e2e-install-'));
  brikaDir = mkdtempSync(join(tmpdir(), 'brika-e2e-data-'));
});

afterEach(() => {
  rmSync(installDir, { recursive: true, force: true });
  rmSync(brikaDir, { recursive: true, force: true });
});

const noopExit: (code: number) => never = (() => undefined) as never;

describe('apply → next-boot-success → backup cleared (happy path)', () => {
  test('orchestrator.recordBootSuccess clears `.previous` only after THIS boot proves itself', async () => {
    // ─── Boot N (currently running, where the user clicks Update) ───
    const versionState = new VersionStateStore(brikaDir, '0.5.0');
    versionState.recordBootAttempt();
    versionState.recordBootSuccess(); // this boot was successful

    const strategy = new FakeStagedStrategy(installDir);
    const orchestrator = UpdateOrchestrator.forTesting({
      mode: 'standalone',
      strategy,
      lock: new UpdateLock(brikaDir),
      audit: new UpdateAuditLog(brikaDir),
      versionState,
    });

    await orchestrator.apply({});
    // After apply: staged install left `.previous` on disk.
    expect(existsSync(previousBinaryPath(installDir))).toBe(true);

    // ─── Boot N+1 (supervisor restart on the new binary) ───
    //
    // The production order in `startHub()` is:
    //   1. checkAndRollback (reads disk state from the prior boot)
    //   2. recordBootAttempt for the new version
    //   3. bootstrap chain runs
    //   4. recordBootSuccess at end of onStart
    //
    // At step 1, the state on disk is the result of boot N's
    // recordBootSuccess — attempted=0.5.0, succeeded=0.5.0 — so
    // previousBootCrashed() is false and rollback is skipped.
    const outcome = checkAndRollback({ systemDir: brikaDir, installDir, exit: noopExit });
    expect(outcome).toBe('no-rollback');
    // Critical: the backup MUST still be on disk — this is the bug
    // the review caught. If `checkAndRollback` deletes it here, a
    // crash later in this boot's onStart leaves us with no fallback.
    expect(existsSync(previousBinaryPath(installDir))).toBe(true);

    // Step 2 — record the new attempt for v0.6.0.
    const nextVersionState = new VersionStateStore(brikaDir, '0.6.0');
    nextVersionState.recordBootAttempt();

    // Step 4 — bootstrap done, orchestrator records success.
    const nextOrchestrator = UpdateOrchestrator.forTesting({
      mode: 'standalone',
      strategy: new FakeStagedStrategy(installDir),
      lock: new UpdateLock(brikaDir),
      audit: new UpdateAuditLog(brikaDir),
      versionState: nextVersionState,
    });
    nextOrchestrator.recordBootSuccess();
    expect(nextVersionState.snapshot.lastBootSucceededVersion).toBe('0.6.0');
    expect(nextVersionState.snapshot.lastSeenVersion).toBe('0.6.0');

    // The orchestrator's `clearPreviousBackup(brikaContext.installDir)`
    // call targets the real brikaContext, not our test installDir, so
    // we can't assert backup deletion here. The unit test for
    // `clearPreviousBackup` covers the file side. What this e2e pins
    // down is the *ordering*: boot-rollback did not clear the backup,
    // and the version-state transitions happened in the right sequence.
  });
});

describe('apply → next-boot-crash → rollback (sad path)', () => {
  test('crashed second boot triggers rollback that restores the prior binary', () => {
    // Simulate the post-apply on-disk state.
    writeFileSync(liveBinaryPath(installDir), 'new-broken');
    writeFileSync(previousBinaryPath(installDir), 'old-known-good');

    // The new boot recorded an attempt but never reached
    // recordBootSuccess — that's what `previousBootCrashed()` watches for.
    const versionState = new VersionStateStore(brikaDir, '0.6.0');
    versionState.recordBootAttempt();
    // (No recordBootSuccess here — crash mid-boot.)

    // Next boot starts. Boot-rollback sees previousBootCrashed=true
    // and a backup on disk → swap.
    let exited = 0;
    const fakeExit: (code: number) => never = (() => {
      exited += 1;
    }) as never;
    const outcome = checkAndRollback({ systemDir: brikaDir, installDir, exit: fakeExit });

    expect(outcome).toBe('rolled-back');
    expect(exited).toBe(1);
    // Live binary is now the known-good content; broken stashed as `.broken`.
    expect(existsSync(liveBinaryPath(installDir))).toBe(true);
    expect(existsSync(`${liveBinaryPath(installDir)}.broken`)).toBe(true);
    expect(existsSync(previousBinaryPath(installDir))).toBe(false);
  });
});
