#!/usr/bin/env bun
/**
 * SQLite migration runner — used in two places:
 *
 *  - {@link applyPendingMigrations} runs on every standalone boot so a fresh
 *    DB converges to the latest schema with no extra command.
 *  - The same file is also a CLI (`bun run server/migrations.ts`) for
 *    pre-warming Docker images and CI.
 *
 * The migration SQL in `migrations/sqlite/` is shared with the Cloudflare D1
 * path (D1 is SQLite under the hood); D1 applies it via
 * `wrangler d1 migrations apply`, which this file does not touch.
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface MigrationRunner {
  ensureTracker(): Promise<void>;
  appliedVersions(): Promise<Set<string>>;
  apply(version: string, sql: string): Promise<void>;
  close(): Promise<void>;
}

export interface MigrationsConfig {
  /** SQLite file path. */
  readonly sqlitePath: string;
}

export interface MigrationsResult {
  readonly applied: ReadonlyArray<string>;
  readonly skipped: number;
}

/**
 * Apply every pending `*.sql` file under `migrations/sqlite/` in lexical
 * order. Idempotent — already-applied versions (tracked in
 * `_brika_migrations`) are skipped. Returns the names of the migrations that
 * actually ran this call.
 */
export async function applyPendingMigrations(config: MigrationsConfig): Promise<MigrationsResult> {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', 'sqlite');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    return { applied: [], skipped: 0 };
  }
  const runner = await sqliteRunner(config.sqlitePath);
  try {
    await runner.ensureTracker();
    const already = await runner.appliedVersions();
    const applied: string[] = [];
    for (const file of files) {
      const version = file.replace(/\.sql$/i, '');
      if (already.has(version)) {
        continue;
      }
      const sql = await readFile(join(dir, file), 'utf8');
      await runner.apply(version, sql);
      applied.push(version);
    }
    return { applied, skipped: already.size };
  } finally {
    await runner.close();
  }
}

type HandleCtor = new (p: string) => SqliteHandle;

interface SqliteHandle {
  exec(sql: string): void;
  prepare(sql: string): { all<T>(...p: unknown[]): T[]; run(...p: unknown[]): { changes: number } };
  close(): void;
}

async function sqliteRunner(path: string): Promise<MigrationRunner> {
  // Inline the driver-loader rather than importing `claims-sqlite.ts` —
  // migrations run before the store is wired and we want zero indirection.
  if ('Bun' in globalThis) {
    const { Database } = (await import('bun:sqlite')) as { Database: HandleCtor };
    return sqliteHandleRunner(new Database(path));
  }
  try {
    const { DatabaseSync } = (await import('node:sqlite')) as { DatabaseSync: HandleCtor };
    return sqliteHandleRunner(new DatabaseSync(path));
  } catch {
    /* fall through */
  }
  // @ts-expect-error optional peer dep — only needed when node:sqlite is absent
  const mod = (await import('better-sqlite3')) as { default: HandleCtor };
  return sqliteHandleRunner(new mod.default(path));
}

function sqliteHandleRunner(db: SqliteHandle): MigrationRunner {
  return {
    ensureTracker(): Promise<void> {
      db.exec(
        'CREATE TABLE IF NOT EXISTS _brika_migrations (version TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)'
      );
      return Promise.resolve();
    },
    appliedVersions(): Promise<Set<string>> {
      const rows = db.prepare('SELECT version FROM _brika_migrations').all<{ version: string }>();
      return Promise.resolve(new Set(rows.map((r) => r.version)));
    },
    apply(version: string, sql: string): Promise<void> {
      db.exec(sql);
      db.prepare('INSERT INTO _brika_migrations (version, applied_at) VALUES (?, ?)').run(
        version,
        Date.now()
      );
      return Promise.resolve();
    },
    close(): Promise<void> {
      db.close();
      return Promise.resolve();
    },
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

async function cli(): Promise<void> {
  const sqlitePath = process.env.BRIKA_SIGNALING_SQLITE_PATH ?? './brika-signaling.db';
  const result = await applyPendingMigrations({ sqlitePath });
  for (const version of result.applied) {
    console.log(`[migrate] applied ${version}`);
  }
  console.log(
    `[migrate] done — ${result.applied.length} new migration(s) applied; ${result.skipped + result.applied.length} total.`
  );
}

if (import.meta.main) {
  await cli();
}
