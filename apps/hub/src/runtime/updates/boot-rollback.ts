/**
 * Boot-time rollback — closes the loop on staged install.
 *
 * Called at the very start of `startHub()`, before the bootstrap
 * framework loads anything. The flow:
 *
 *   1. Read `${brikaDir}/.version-state.json`.
 *   2. If `previousBootCrashed()` is *false* and a `.previous` backup
 *      exists, the previous boot succeeded — close the rollback window
 *      by deleting the backup. (Happens here rather than at
 *      `recordBootSuccess()` because the live binary is currently the
 *      new one; we can safely delete the old `.previous` only after a
 *      *subsequent* successful boot has carried us past the crash
 *      window.)
 *   3. If `previousBootCrashed()` is *true* and a `.previous` backup
 *      exists, the running binary is the one that just crashed. Swap
 *      it for the backup and exit so the supervisor restarts us with
 *      the known-good binary.
 *   4. Audit log either outcome.
 *
 * Stays deliberately small: no DI, no logger, no DB. We're running
 * before bootstrap and *cannot trust* that anything beyond the
 * filesystem + `@brika/version` is healthy on this binary.
 */

import { existsSync, renameSync, rmSync } from 'node:fs';
import { BRIKA_VERSION } from '@brika/version';
import { brikaContext } from '@/runtime/context/brika-context';
import { RESTART_CODE } from '@/runtime/restart-code';
import { UpdateAuditLog } from './audit-log';
import {
  clearPreviousBackup,
  hasPreviousBackup,
  liveBinaryPath,
  previousBinaryPath,
} from './staged-install';
import { VersionStateStore } from './version-state';

interface RollbackInput {
  /** Equivalent to `brikaContext.brikaDir`, but passed explicitly to keep this module DI-free. */
  readonly brikaDir: string;
  /** Equivalent to `brikaContext.installDir`. */
  readonly installDir: string;
  /** Exit hook; defaults to `process.exit`. Tests pass a spy. */
  readonly exit?: (code: number) => never;
}

export type RollbackOutcome = 'no-backup' | 'cleared-backup' | 'rolled-back' | 'skipped-no-crash';

/**
 * Executes the rollback decision and returns the outcome. On
 * `'rolled-back'` the supplied `exit` is invoked and the function
 * never returns — control passes back to the supervisor.
 */
export function checkAndRollback(input: RollbackInput): RollbackOutcome {
  const audit = new UpdateAuditLog(input.brikaDir);
  const versionState = new VersionStateStore(input.brikaDir, BRIKA_VERSION);

  if (!hasPreviousBackup(input.installDir)) {
    return 'no-backup';
  }

  if (!versionState.previousBootCrashed()) {
    // Previous boot succeeded — close the rollback window.
    clearPreviousBackup(input.installDir);
    audit.append('boot.success', {
      version: BRIKA_VERSION,
      action: 'cleared-previous-backup',
    });
    return 'cleared-backup';
  }

  // Previous boot crashed. Swap live ↔ previous and let the supervisor restart us.
  const live = liveBinaryPath(input.installDir);
  const previous = previousBinaryPath(input.installDir);
  const broken = `${live}.broken`;

  audit.append('apply.rolled-back', {
    crashedVersion: versionState.snapshot.lastBootAttemptedVersion,
    rollingBackTo: versionState.snapshot.lastBootSucceededVersion,
  });

  try {
    // Best-effort: remove any prior `.broken` from an earlier rollback
    // so a chain of failed updates doesn't leak files.
    if (existsSync(broken)) {
      rmSync(broken, { force: true });
    }
    renameSync(live, broken);
    renameSync(previous, live);
  } catch (err) {
    // Rollback failed for some reason (permissions, fs race). Audit and
    // continue booting the crashed binary — at least the user gets a
    // chance to recover via `brika update --offline`.
    audit.append('apply.failure', {
      reason: 'rollback-failed',
      error: err instanceof Error ? err.message : String(err),
    });
    return 'no-backup';
  }

  versionState.recordUpdate({
    from: versionState.snapshot.lastBootAttemptedVersion ?? 'unknown',
    to: versionState.snapshot.lastBootSucceededVersion ?? 'unknown',
    at: new Date().toISOString(),
    status: 'rolled-back',
    reason: 'previous boot crashed before onStart completed',
  });

  const exit = input.exit ?? process.exit.bind(process);
  exit(RESTART_CODE);
  return 'rolled-back';
}

/**
 * Convenience wrapper that resolves paths from `brikaContext` and
 * calls {@link checkAndRollback}. Designed to be the first call in
 * `startHub()`.
 */
export function rollbackIfPreviousBootCrashed(): RollbackOutcome {
  return checkAndRollback({
    brikaDir: brikaContext.brikaDir,
    installDir: brikaContext.installDir,
  });
}
