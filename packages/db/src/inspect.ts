/**
 * Inspection utilities for the migration system and on-disk database
 * files. Powers the `brika-db doctor` and `brika-db list` commands and
 * the consistency test that guards against orphaned migration files.
 *
 * None of these helpers open a database for *writing* — `inspectDatabaseFile`
 * opens read-only so it is safe to run against a live install.
 */

import type { Database } from 'bun:sqlite';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { LEDGER_TABLE } from './migrator';
import { loadSqlite } from './sqlite';

// Both the current and legacy migration ledgers are internal bookkeeping;
// hide them from the reported table list.
const LEGACY_LEDGER_TABLE = '__drizzle_migrations';

interface JournalEntry {
  readonly idx: number;
  readonly tag: string;
}

interface Journal {
  readonly entries: readonly JournalEntry[];
}

export interface MigrationFolderReport {
  readonly folder: string;
  /** Tags declared in `meta/_journal.json`, in order. */
  readonly journalTags: readonly string[];
  /** `*.sql` files present on disk (basename without extension). */
  readonly sqlFiles: readonly string[];
  /**
   * `.sql` files on disk that no journal entry references. These never
   * run at runtime (the macro loader reads the journal, not the dir)
   * and are almost always abandoned cruft — the class of bug that left
   * a dead `granted_capabilities` migration in the tree.
   */
  readonly orphanSql: readonly string[];
  /** Journal entries whose `.sql` file is missing — a broken migration. */
  readonly missingSql: readonly string[];
  /**
   * `true` when the *latest* journal entry has no `meta/<tag>.json`
   * snapshot. That snapshot is the baseline `drizzle-kit generate` diffs
   * the next schema change against — without it, `generate` re-emits the
   * whole schema instead of an incremental migration. Intermediate
   * historical snapshots are not required and are not flagged.
   */
  readonly baselineSnapshotMissing: boolean;
}

function readJournal(folder: string): Journal | null {
  const journalPath = join(folder, 'meta', '_journal.json');
  if (!existsSync(journalPath)) {
    return null;
  }
  const parsed: unknown = JSON.parse(readFileSync(journalPath, 'utf8'));
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'entries' in parsed &&
    Array.isArray(parsed.entries)
  ) {
    const entries: JournalEntry[] = [];
    for (const entry of parsed.entries) {
      if (
        typeof entry === 'object' &&
        entry !== null &&
        'tag' in entry &&
        typeof entry.tag === 'string' &&
        'idx' in entry &&
        typeof entry.idx === 'number'
      ) {
        entries.push({ idx: entry.idx, tag: entry.tag });
      }
    }
    return { entries };
  }
  return null;
}

/**
 * Inspect one migrations folder and report any drift between the
 * journal and the `.sql` files / snapshots on disk. A folder is
 * "healthy" when `orphanSql` and `missingSql` are both empty.
 */
export function inspectMigrationsFolder(folder: string): MigrationFolderReport {
  const journal = readJournal(folder);
  const journalTags = journal?.entries.map((e) => e.tag) ?? [];

  const sqlFiles = existsSync(folder)
    ? readdirSync(folder)
        .filter((f) => f.endsWith('.sql'))
        .map((f) => basename(f, '.sql'))
        .sort((a, b) => a.localeCompare(b))
    : [];

  const journalSet = new Set(journalTags);
  const sqlSet = new Set(sqlFiles);
  const metaDir = join(folder, 'meta');
  const latest = journal?.entries.at(-1);

  return {
    folder,
    journalTags,
    sqlFiles,
    orphanSql: sqlFiles.filter((tag) => !journalSet.has(tag)),
    missingSql: journalTags.filter((tag) => !sqlSet.has(tag)),
    // Drizzle names snapshots `<paddedIdx>_snapshot.json`, not `<tag>.json`.
    baselineSnapshotMissing: latest !== undefined && !existsSync(snapshotPath(metaDir, latest.idx)),
  };
}

/** Path to the Drizzle snapshot for a migration index (`0001` → `meta/0001_snapshot.json`). */
function snapshotPath(metaDir: string, idx: number): string {
  return join(metaDir, `${String(idx).padStart(4, '0')}_snapshot.json`);
}

export interface TableInfo {
  readonly name: string;
  readonly rows: number;
}

export interface DatabaseFileReport {
  readonly path: string;
  readonly exists: boolean;
  /** File size in bytes (the main `.db` file, excluding `-wal`/`-shm`). */
  readonly sizeBytes: number;
  /** Combined size of `-wal` + `-shm` sidecar files, if present. */
  readonly walBytes: number;
  readonly tables: readonly TableInfo[];
  /** Rows in `__drizzle_migrations` — how many migrations have been applied. */
  readonly appliedMigrations: number;
}

function fileSize(path: string): number {
  return existsSync(path) ? statSync(path).size : 0;
}

/**
 * Open a SQLite file read-only and report its tables, row counts, and
 * applied-migration count. Safe against a live install (read-only, WAL).
 */
export function inspectDatabaseFile(path: string): DatabaseFileReport {
  if (!existsSync(path)) {
    return {
      path,
      exists: false,
      sizeBytes: 0,
      walBytes: 0,
      tables: [],
      appliedMigrations: 0,
    };
  }

  const Database = loadSqlite();
  const db = new Database(path, { readonly: true });
  try {
    const tables: TableInfo[] = [];
    let appliedMigrations = 0;

    const rows = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all();
    for (const { name } of rows) {
      const count = countRows(db, name);
      if (name === LEDGER_TABLE) {
        appliedMigrations = count;
      } else if (name !== LEGACY_LEDGER_TABLE) {
        tables.push({ name, rows: count });
      }
    }

    return {
      path,
      exists: true,
      sizeBytes: fileSize(path),
      walBytes: fileSize(`${path}-wal`) + fileSize(`${path}-shm`),
      tables,
      appliedMigrations,
    };
  } finally {
    db.close();
  }
}

/** Count rows in a table. `name` comes from `sqlite_master`, quoted to be safe. */
function countRows(db: Database, name: string): number {
  return db.query<{ c: number }, []>(`SELECT COUNT(*) AS c FROM "${name}"`).get()?.c ?? 0;
}
