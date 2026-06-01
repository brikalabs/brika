/**
 * Database backup — pairs the SQLite databases with the binary backup
 * during an update so a rollback reverts schema *and* binary together.
 *
 * The problem this solves: `@brika/db` migrations are forward-only and
 * run lazily on `.open()`, which happens during the new binary's first
 * boot — *after* the binary swap is already committed. If that boot then
 * crashes, `boot-rollback.ts` swaps the old binary back, but the old
 * code would then open databases that the new version already migrated
 * to a newer schema. Version skew, and no down-migrations to undo it.
 *
 * The fix mirrors the binary's `.previous` backup: on the first boot
 * after an update (detected by the presence of the binary backup), and
 * *before* any database is opened, we copy `${brikaDir}/db` to
 * `${brikaDir}/db.previous`. The lifecycle then tracks the binary backup
 * exactly:
 *
 *   - boot succeeds  → `clearDatabaseBackup` (alongside `clearPreviousBackup`)
 *   - boot crashes   → next boot restores `db.previous` over `db` while it
 *                      swaps the binary back, then clears the backup
 *
 * Deliberately DI-free and filesystem-only (like `boot-rollback.ts`): it
 * runs before the bootstrap container exists and must not depend on any
 * service that a half-booted binary might have left broken.
 *
 * The copy captures the whole `db/` directory — every `.db` plus its
 * `-wal`/`-shm` sidecars — so the snapshot is point-in-time consistent.
 * It happens before any handle is open (the previous process has exited,
 * the current one hasn't opened anything yet), so a plain copy is safe.
 */

import { cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { brikaContext } from '@/runtime/context/brika-context';
import { UpdateAuditLog } from './audit-log';
import { hasPreviousBackup } from './staged-install';

const DB_DIRNAME = 'db';
const DB_BACKUP_DIRNAME = 'db.previous';

function databaseDir(brikaDir: string): string {
  return join(brikaDir, DB_DIRNAME);
}

function databaseBackupDir(brikaDir: string): string {
  return join(brikaDir, DB_BACKUP_DIRNAME);
}

/** True when a database backup is on disk — i.e. a DB rollback is possible. */
export function hasDatabaseBackup(brikaDir: string): boolean {
  return existsSync(databaseBackupDir(brikaDir));
}

/**
 * Copy `db/` → `db.previous`, capturing the pre-migration state. No-op
 * (returns `false`) when there is no `db/` dir yet (fresh install) or a
 * backup already exists (idempotent — never clobber an in-flight backup).
 */
export function backupDatabases(brikaDir: string): boolean {
  const source = databaseDir(brikaDir);
  const dest = databaseBackupDir(brikaDir);
  if (!existsSync(source) || existsSync(dest)) {
    return false;
  }
  cpSync(source, dest, { recursive: true });
  return true;
}

/**
 * Restore `db.previous` over `db`, discarding any migrations the failed
 * boot applied. Returns `false` when there is no backup to restore. The
 * backup is left in place; the caller clears it via
 * {@link clearDatabaseBackup} once the rollback is committed.
 */
export function restoreDatabases(brikaDir: string): boolean {
  const backup = databaseBackupDir(brikaDir);
  if (!existsSync(backup)) {
    return false;
  }
  const live = databaseDir(brikaDir);
  rmSync(live, { recursive: true, force: true });
  cpSync(backup, live, { recursive: true });
  return true;
}

/** Delete the database backup. Called once a transition is committed. */
export function clearDatabaseBackup(brikaDir: string): void {
  rmSync(databaseBackupDir(brikaDir), { recursive: true, force: true });
}

/**
 * Snapshot the databases when an update is mid-flight. Called from
 * `startHub()` after the boot-rollback check (so we know we're booting
 * *forward* into a new version, not re-booting a crashed one) and before
 * the bootstrap chain opens — and migrates — any database.
 *
 * Guarded on the binary backup: `db.previous` is only created when a
 * `brika.previous` exists, which only happens on the first boot after a
 * managed-binary update. On normal boots (and in dev / container /
 * system-package modes that never stage a binary backup) this is a cheap
 * `existsSync` and nothing is copied.
 */
export function backupDatabasesIfUpdatePending(): boolean {
  const { brikaDir, installDir } = brikaContext;
  if (!hasPreviousBackup(installDir) || hasDatabaseBackup(brikaDir)) {
    return false;
  }
  const audit = new UpdateAuditLog(brikaDir);
  try {
    const backedUp = backupDatabases(brikaDir);
    if (backedUp) {
      audit.append('db.backup', { toVersion: brikaContext.version });
    }
    return backedUp;
  } catch (err) {
    // A failed backup must not block boot — but record it, because it
    // means a later rollback won't be able to restore the schema.
    audit.append('apply.failure', {
      reason: 'db-backup-failed',
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
