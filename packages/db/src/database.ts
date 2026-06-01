import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveDatabasePath } from './config';
import type { Migration } from './migration';
import { applyMigrations } from './migrator';
import { loadDrizzle, loadSqlite } from './sqlite';

export type BrikaDatabase<TSchema extends Record<string, unknown>> = ReturnType<
  typeof openDatabase<TSchema>
>;

export interface DatabaseDefinition<TSchema extends Record<string, unknown>> {
  open(path?: string): BrikaDatabase<TSchema>;
}

/**
 * Declare a database: its logical name, Drizzle schema, and ordered
 * migrations (SQL from the `loadMigrations` macro and/or TS migrations
 * from `defineMigration`). Returns a lazy opener.
 */
export function defineDatabase<TSchema extends Record<string, unknown>>(
  name: string,
  schema: TSchema,
  migrations: readonly Migration[]
): DatabaseDefinition<TSchema> {
  return {
    open: (path?: string) => openDatabase(path ?? name, schema, migrations),
  };
}

function openDatabase<TSchema extends Record<string, unknown>>(
  path: string,
  schema: TSchema,
  migrations: readonly Migration[]
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

  // Build the Drizzle handle first so code migrations can use it, then
  // apply pending migrations (schema + data) before returning.
  const db = loadDrizzle()(sqlite, { schema });
  applyMigrations(sqlite, db, migrations);

  return { db, sqlite, path: resolved };
}
