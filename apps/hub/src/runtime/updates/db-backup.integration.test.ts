/**
 * Covers the database backup/restore primitives that pair the SQLite
 * files with the binary backup across an update. The DI-free guard
 * (`backupDatabasesIfUpdatePending`) is exercised end-to-end via the
 * boot-rollback integration tests; here we test the filesystem logic
 * directly with an explicit `brikaDir`.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  backupDatabases,
  clearDatabaseBackup,
  hasDatabaseBackup,
  restoreDatabases,
} from './db-backup';

let brikaDir: string;

function dbFile(name: string): string {
  return join(brikaDir, 'db', name);
}

function writeDb(name: string, content: string): void {
  writeFileSync(dbFile(name), content);
}

function readDb(name: string): string {
  return readFileSync(dbFile(name), 'utf8');
}

beforeEach(() => {
  brikaDir = mkdtempSync(join(tmpdir(), 'brika-dbbackup-'));
  mkdirSync(join(brikaDir, 'db'), { recursive: true });
});

afterEach(() => {
  rmSync(brikaDir, { recursive: true, force: true });
});

describe('backupDatabases', () => {
  test('copies the db directory and is idempotent', () => {
    writeDb('state.db', 'v1');
    writeDb('state.db-wal', 'wal1');

    expect(backupDatabases(brikaDir)).toBe(true);
    expect(hasDatabaseBackup(brikaDir)).toBe(true);

    // A second call must NOT clobber the in-flight backup.
    writeDb('state.db', 'v2-mid-migration');
    expect(backupDatabases(brikaDir)).toBe(false);
    expect(readFileSync(join(brikaDir, 'db.previous', 'state.db'), 'utf8')).toBe('v1');
  });

  test('is a no-op when there is no db directory yet (fresh install)', () => {
    rmSync(join(brikaDir, 'db'), { recursive: true, force: true });
    expect(backupDatabases(brikaDir)).toBe(false);
    expect(hasDatabaseBackup(brikaDir)).toBe(false);
  });
});

describe('restoreDatabases', () => {
  test('reverts the db directory to the backed-up state', () => {
    writeDb('state.db', 'v1');
    writeDb('auth.db', 'auth-v1');
    backupDatabases(brikaDir);

    // Simulate a forward migration the crashed boot applied.
    writeDb('state.db', 'v2-migrated');
    writeDb('logs.db', 'logs-written-during-failed-boot');

    expect(restoreDatabases(brikaDir)).toBe(true);
    expect(readDb('state.db')).toBe('v1');
    expect(readDb('auth.db')).toBe('auth-v1');
    // A file that only existed in the failed boot is gone after restore.
    expect(() => readDb('logs.db')).toThrow();
  });

  test('returns false when there is no backup', () => {
    expect(restoreDatabases(brikaDir)).toBe(false);
  });

  test('leaves the backup in place for the caller to clear', () => {
    writeDb('state.db', 'v1');
    backupDatabases(brikaDir);
    restoreDatabases(brikaDir);
    expect(hasDatabaseBackup(brikaDir)).toBe(true);

    clearDatabaseBackup(brikaDir);
    expect(hasDatabaseBackup(brikaDir)).toBe(false);
  });
});

describe('full lifecycle', () => {
  test('backup → success → clear leaves only the live db', () => {
    writeDb('state.db', 'v1');
    backupDatabases(brikaDir);
    writeDb('state.db', 'v2-migrated');
    // Boot succeeded — clear the snapshot, keep the migrated db.
    clearDatabaseBackup(brikaDir);

    expect(hasDatabaseBackup(brikaDir)).toBe(false);
    expect(readDb('state.db')).toBe('v2-migrated');
  });
});
