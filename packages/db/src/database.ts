import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { MigrationMeta } from 'drizzle-orm/migrator';
import { resolveDatabasePath } from './config';

export type BrikaDatabase<TSchema extends Record<string, unknown>> = ReturnType<
  typeof openDatabase<TSchema>
>;

export interface DatabaseDefinition<TSchema extends Record<string, unknown>> {
  open(path?: string): BrikaDatabase<TSchema>;
}

export function defineDatabase<TSchema extends Record<string, unknown>>(
  name: string,
  schema: TSchema,
  migrations: MigrationMeta[]
): DatabaseDefinition<TSchema> {
  return {
    open: (path?: string) => openDatabase(path ?? name, schema, migrations),
  };
}

function openDatabase<TSchema extends Record<string, unknown>>(
  path: string,
  schema: TSchema,
  migrations: MigrationMeta[]
) {
  const resolved = resolveDatabasePath(path);
  if (resolved !== ':memory:') {
    mkdirSync(dirname(resolved), { recursive: true });
  }
  const sqlite = new Database(resolved, { create: true });
  // auto_vacuum must be set BEFORE the first table is created to take effect
  // without a full VACUUM. On a fresh DB this activates incremental vacuuming
  // immediately; on a pre-existing DB it stays latent until the one-time
  // reclaim below runs a VACUUM. Either way, freed pages are released by
  // `incrementalVacuum` (called after a retention prune) rather than left as
  // dead weight (the cause of the 200 MB+ logs.db that prompted this).
  sqlite.query('PRAGMA auto_vacuum = INCREMENTAL').run();
  sqlite.query('PRAGMA journal_mode = WAL').run();
  sqlite.query('PRAGMA synchronous = NORMAL').run();
  sqlite.query('PRAGMA temp_store = MEMORY').run();
  sqlite.query('PRAGMA mmap_size = 268435456').run();
  sqlite.query('PRAGMA foreign_keys = ON').run();

  applyMigrations(sqlite, migrations);
  reclaimIfBloated(sqlite, resolved);

  const db = drizzle(sqlite, { schema });
  return { db, sqlite, path: resolved };
}

/** Read a single-value PRAGMA (e.g. `page_count`) as an integer. */
function readPragmaInt(sqlite: Database, pragma: string): number {
  const row: unknown = sqlite.query(`PRAGMA ${pragma}`).get();
  if (row !== null && typeof row === 'object') {
    const value = Object.values(row)[0];
    if (typeof value === 'number') {
      return value;
    }
  }
  return 0;
}

/**
 * Reclaim free pages back to the OS. `incremental_vacuum` moves freed pages off
 * the database, and the truncating checkpoint then shrinks the on-disk file (in
 * WAL mode the main file is only resized at a checkpoint). No-op unless
 * `auto_vacuum` is enabled. Safe to call after a retention prune.
 */
export function incrementalVacuum(sqlite: Database): void {
  sqlite.query('PRAGMA incremental_vacuum').run();
  sqlite.query('PRAGMA wal_checkpoint(TRUNCATE)').run();
}

/**
 * One-time reclaim for a DB that bloated before `auto_vacuum` was enabled (the
 * retention pruner deletes rows but old SQLite never returned the pages). A full
 * `VACUUM` rewrites the file compactly AND activates incremental auto_vacuum
 * going forward. Guarded so it only fires when the free space is large enough to
 * be worth the rewrite, so it's effectively a one-time cost, not every boot.
 */
function reclaimIfBloated(sqlite: Database, path: string): void {
  if (path === ':memory:') {
    return;
  }
  const pageCount = readPragmaInt(sqlite, 'page_count');
  const freelist = readPragmaInt(sqlite, 'freelist_count');
  if (pageCount === 0) {
    return;
  }
  // Only worth it when free pages are both substantial in absolute terms and a
  // meaningful fraction of the file (avoids churning small/healthy DBs).
  if (freelist < RECLAIM_MIN_FREE_PAGES || freelist / pageCount < RECLAIM_FREE_RATIO) {
    return;
  }
  sqlite.query('VACUUM').run();
  // VACUUM compacts the page graph, but in WAL mode the main .db file is only
  // resized at a checkpoint, so truncate explicitly to actually return the
  // space to the OS.
  sqlite.query('PRAGMA wal_checkpoint(TRUNCATE)').run();
}

/** ~8 MiB of free pages (at 4 KiB/page) before a one-time VACUUM is worthwhile. */
const RECLAIM_MIN_FREE_PAGES = 2000;
/** …and free pages must be at least this fraction of the file. */
const RECLAIM_FREE_RATIO = 0.25;

const MIGRATIONS_TABLE = '__drizzle_migrations';

/**
 * Applies pending migrations idempotently.
 *
 * Skip decisions are made by **hash**, not by `folderMillis`. The previous
 * timestamp-watermark approach broke when a journal entry's `when` value
 * shifted (e.g. a rebase before merge): a developer who had already run
 * the migration with the old `when` saw the runner re-apply it because
 * `newWhen > oldWhen` looked unapplied. Hashes are derived from the SQL
 * itself, so they survive history rewrites unless the SQL actually changes.
 */
function applyMigrations(sqlite: Database, migrations: MigrationMeta[]): void {
  sqlite.run(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`
  );

  const appliedHashes = new Set(
    sqlite
      .query<{ hash: string }, []>(`SELECT hash FROM ${MIGRATIONS_TABLE}`)
      .all()
      .map((row) => row.hash)
  );

  const insert = sqlite.prepare<unknown, [string, number]>(
    `INSERT INTO ${MIGRATIONS_TABLE} (hash, created_at) VALUES (?, ?)`
  );

  sqlite.transaction(() => {
    for (const migration of migrations) {
      if (appliedHashes.has(migration.hash)) {
        continue;
      }
      for (const stmt of migration.sql) {
        sqlite.run(stmt);
      }
      insert.run(migration.hash, migration.folderMillis);
    }
  })();
}
