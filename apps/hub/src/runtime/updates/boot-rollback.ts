/**
 * Boot-time rollback — closes the loop on staged install.
 *
 * Called at the very start of `startHub()`, before the bootstrap
 * framework loads anything. The flow:
 *
 *   1. Read `${brikaDir}/.version-state.json`.
 *   2. If `previousBootCrashed()` is *true* and a `.previous` backup
 *      exists, the running binary is the one that just crashed. Swap
 *      it for the backup and exit so the supervisor restarts us with
 *      the known-good binary.
 *   3. Otherwise return `'no-rollback'` — cleanup of the `.previous`
 *      backup is the orchestrator's job in `recordBootSuccess()`
 *      after THIS boot has proven itself. Deleting it here would
 *      close the rollback window before the current boot reached
 *      `onStart`, leaving us with no fallback if it crashes later.
 *
 * Stays deliberately small: no DI, no logger, no DB. We're running
 * before bootstrap and *cannot trust* that anything beyond the
 * filesystem + `@brika/version` is healthy on this binary.
 */

import { existsSync, renameSync, rmSync } from 'node:fs';
import { brikaContext } from '@/runtime/context/brika-context';
import { RESTART_CODE } from '@/runtime/restart-code';
import { UpdateAuditLog } from './audit-log';
import { clearDatabaseBackup, restoreDatabases } from './db-backup';
import { hasPreviousBackup, liveBinaryPath, previousBinaryPath } from './staged-install';
import { VersionStateStore } from './version-state';

interface RollbackInput {
  /** Equivalent to `brikaContext.brikaDir`, but passed explicitly to keep this module DI-free. */
  readonly brikaDir: string;
  /** Equivalent to `brikaContext.installDir`. */
  readonly installDir: string;
  /** Exit hook; defaults to `process.exit`. Tests pass a spy. */
  readonly exit?: (code: number) => never;
}

export type RollbackOutcome = 'no-backup' | 'no-rollback' | 'rolled-back';

/**
 * Executes the rollback decision and returns the outcome. On
 * `'rolled-back'` the supplied `exit` is invoked and the function
 * never returns — control passes back to the supervisor.
 */
export function checkAndRollback(input: RollbackInput): RollbackOutcome {
  const audit = new UpdateAuditLog(input.brikaDir);
  const versionState = new VersionStateStore(input.brikaDir, brikaContext.version);

  if (!hasPreviousBackup(input.installDir)) {
    return 'no-backup';
  }

  if (!versionState.previousBootCrashed()) {
    // Previous boot succeeded, but THIS boot hasn't proven itself yet
    // — leave `.previous` in place. The orchestrator's
    // `recordBootSuccess()` clears it after `onStart` completes, at
    // which point the rollback window for the *current* version
    // closes.
    return 'no-rollback';
  }

  // Previous boot crashed. Swap live ↔ previous and let the supervisor restart us.
  const live = liveBinaryPath(input.installDir);
  const previous = previousBinaryPath(input.installDir);
  const broken = `${live}.broken`;

  audit.append('apply.rolled-back', {
    crashedVersion: versionState.snapshot.lastBootAttemptedVersion,
    rollingBackTo: versionState.snapshot.lastBootSucceededVersion,
  });

  // Best-effort: remove any prior `.broken` from an earlier rollback
  // so a chain of failed updates doesn't leak files.
  if (existsSync(broken)) {
    try {
      rmSync(broken, { force: true });
    } catch {
      // ignore — worst case the new `.broken` rename below fails too
      // and we hit the fallback path.
    }
  }

  // Two-step rename. If the second step fails after the first one
  // succeeded, we'd be left with NO `brika` binary at all — the
  // supervisor would ENOENT on restart and the user can't even run
  // `brika update --offline` to recover. Catch that case and undo
  // the first rename so the (crashed) live binary is at least
  // present.
  try {
    renameSync(live, broken);
  } catch (err) {
    audit.append('apply.failure', {
      reason: 'rollback-failed',
      stage: 'live-to-broken',
      error: err instanceof Error ? err.message : String(err),
    });
    return 'no-backup';
  }

  try {
    renameSync(previous, live);
  } catch (err) {
    // Critical: we already moved `live` aside. Put it back so the
    // system stays bootable even if the previous binary can't be
    // restored.
    try {
      renameSync(broken, live);
    } catch {
      // Truly stuck — log loudly. The binary is at `${live}.broken`
      // and the user can recover by renaming it manually.
    }
    audit.append('apply.failure', {
      reason: 'rollback-failed',
      stage: 'previous-to-live',
      error: err instanceof Error ? err.message : String(err),
    });
    return 'no-backup';
  }

  // Binary is back on the known-good version; now revert the databases
  // to their pre-migration snapshot so the restored binary doesn't open a
  // schema the crashed version had already migrated forward. Best-effort:
  // a restore failure must not block the rollback exit — the binary swap
  // is the load-bearing recovery; worst case the operator sees a schema
  // newer than the binary, which was the status quo before DB backups.
  try {
    if (restoreDatabases(input.brikaDir)) {
      audit.append('db.restore', {
        restoredToVersion: versionState.snapshot.lastBootSucceededVersion,
      });
    }
    clearDatabaseBackup(input.brikaDir);
  } catch (err) {
    audit.append('apply.failure', {
      reason: 'db-restore-failed',
      error: err instanceof Error ? err.message : String(err),
    });
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
