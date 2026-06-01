import type { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { MigrationMeta } from 'drizzle-orm/migrator';
import { resolveDatabasePath } from './config';
import { loadDrizzle, loadSqlite } from './sqlite';

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
  const Database = loadSqlite();
  const sqlite = new Database(resolved, { create: true });
  sqlite.query('PRAGMA journal_mode = WAL').run();
  sqlite.query('PRAGMA synchronous = NORMAL').run();
  sqlite.query('PRAGMA temp_store = MEMORY').run();
  sqlite.query('PRAGMA mmap_size = 268435456').run();
  sqlite.query('PRAGMA foreign_keys = ON').run();

  applyMigrations(sqlite, migrations);

  const db = loadDrizzle()(sqlite, { schema });
  return { db, sqlite, path: resolved };
}

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
