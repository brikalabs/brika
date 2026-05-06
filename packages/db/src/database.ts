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
  sqlite.query('PRAGMA journal_mode = WAL').run();
  sqlite.query('PRAGMA synchronous = NORMAL').run();
  sqlite.query('PRAGMA temp_store = MEMORY').run();
  sqlite.query('PRAGMA mmap_size = 268435456').run();
  sqlite.query('PRAGMA foreign_keys = ON').run();

  applyMigrations(sqlite, migrations);

  const db = drizzle(sqlite, { schema });
  return { db, sqlite, path: resolved };
}

const MIGRATIONS_TABLE = '__drizzle_migrations';

function applyMigrations(sqlite: Database, migrations: MigrationMeta[]): void {
  sqlite.run(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`
  );

  const last = sqlite
    .query<{ created_at: number | null }, []>(
      `SELECT created_at FROM ${MIGRATIONS_TABLE} ORDER BY created_at DESC LIMIT 1`
    )
    .get();
  const lastMillis = last?.created_at ?? -1;

  const insert = sqlite.prepare<unknown, [string, number]>(
    `INSERT INTO ${MIGRATIONS_TABLE} (hash, created_at) VALUES (?, ?)`
  );

  sqlite.transaction(() => {
    for (const migration of migrations) {
      if (Number(lastMillis) >= migration.folderMillis) {
        continue;
      }
      for (const stmt of migration.sql) {
        sqlite.run(stmt);
      }
      insert.run(migration.hash, migration.folderMillis);
    }
  })();
}
