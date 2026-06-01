/**
 * Migration runner — applies pending SQL and code migrations against an
 * open database, idempotently, in a single forward pass.
 *
 * ## Ledger
 *
 * Applied migrations are tracked in `__brika_migrations`, keyed by `tag`.
 * Each migration runs inside its own transaction together with the ledger
 * insert, so a crash mid-run leaves the database at a clean migration
 * boundary — never half-applied.
 *
 * ## Back-compat seed
 *
 * Earlier versions tracked SQL migrations by **hash** in Drizzle's
 * `__drizzle_migrations` table. On first run against the new ledger we
 * seed `__brika_migrations` from it: for every applied hash we look up
 * the matching {@link SqlMigration} (hashes are stable) and record its
 * tag. That way an upgrade never re-runs a migration an install already
 * applied. The seed is idempotent and cheap to re-evaluate.
 *
 * ## Ordering
 *
 * Migrations are sorted by tag, so SQL and code migrations interleave:
 * `0001_add_col` (sql) → `0002_backfill` (code) → `0003_not_null` (sql).
 */

import type { Database } from 'bun:sqlite';
import {
  type Migration,
  type MigrationContext,
  type MigrationDatabase,
  type SqlMigration,
  sortMigrations,
} from './migration';

export const LEDGER_TABLE = '__brika_migrations';
const LEGACY_TABLE = '__drizzle_migrations';

export interface MigrationOutcome {
  /** Tags applied during this run, in order. */
  readonly applied: readonly string[];
  /** Tags already applied (skipped) at the start of this run. */
  readonly skipped: readonly string[];
}

/**
 * Apply all pending migrations. Returns which tags were applied vs.
 * skipped — handy for logging and tests. Safe to call on every open.
 */
export function applyMigrations(
  sqlite: Database,
  db: MigrationDatabase,
  migrations: readonly Migration[]
): MigrationOutcome {
  const ordered = sortMigrations(migrations);

  ensureLedger(sqlite);
  seedFromLegacy(sqlite, ordered);

  const appliedTags = loadAppliedTags(sqlite);
  const insert = sqlite.prepare<unknown, [string, string | null, string, number]>(
    `INSERT OR IGNORE INTO ${LEDGER_TABLE} (tag, hash, kind, applied_at) VALUES (?, ?, ?, ?)`
  );

  const applied: string[] = [];
  const skipped: string[] = [];
  const ctx: MigrationContext = { db, sqlite };

  for (const migration of ordered) {
    if (appliedTags.has(migration.tag)) {
      skipped.push(migration.tag);
      continue;
    }
    sqlite.transaction(() => {
      runOne(migration, ctx);
      insert.run(migration.tag, hashOf(migration), migration.kind, Date.now());
    })();
    applied.push(migration.tag);
  }

  return { applied, skipped };
}

function runOne(migration: Migration, ctx: MigrationContext): void {
  if (migration.kind === 'sql') {
    for (const statement of migration.statements) {
      ctx.sqlite.run(statement);
    }
    return;
  }
  migration.run(ctx);
}

function hashOf(migration: Migration): string | null {
  return migration.kind === 'sql' ? migration.hash : null;
}

function ensureLedger(sqlite: Database): void {
  sqlite.run(
    `CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (
       tag TEXT PRIMARY KEY,
       hash TEXT,
       kind TEXT NOT NULL,
       applied_at INTEGER NOT NULL
     )`
  );
}

function loadAppliedTags(sqlite: Database): Set<string> {
  const tags = new Set<string>();
  for (const row of sqlite.query(`SELECT tag FROM ${LEDGER_TABLE}`).all()) {
    if (typeof row === 'object' && row !== null && 'tag' in row && typeof row.tag === 'string') {
      tags.add(row.tag);
    }
  }
  return tags;
}

/**
 * Seed the tag-based ledger from the legacy hash-based `__drizzle_migrations`
 * table so an upgrade doesn't re-run already-applied SQL migrations.
 */
function seedFromLegacy(sqlite: Database, ordered: readonly Migration[]): void {
  if (!tableExists(sqlite, LEGACY_TABLE)) {
    return;
  }

  const byHash = new Map<string, SqlMigration>();
  for (const migration of ordered) {
    if (migration.kind === 'sql') {
      byHash.set(migration.hash, migration);
    }
  }

  const seed = sqlite.prepare<unknown, [string, string, number]>(
    `INSERT OR IGNORE INTO ${LEDGER_TABLE} (tag, hash, kind, applied_at) VALUES (?, ?, 'sql', ?)`
  );

  sqlite.transaction(() => {
    for (const row of sqlite.query(`SELECT hash, created_at FROM ${LEGACY_TABLE}`).all()) {
      if (typeof row !== 'object' || row === null || !('hash' in row)) {
        continue;
      }
      const hash = row.hash;
      if (typeof hash !== 'string') {
        continue;
      }
      const migration = byHash.get(hash);
      if (!migration) {
        continue;
      }
      const createdAt =
        'created_at' in row && typeof row.created_at === 'number' ? row.created_at : Date.now();
      seed.run(migration.tag, hash, createdAt);
    }
  })();
}

function tableExists(sqlite: Database, name: string): boolean {
  const row = sqlite
    .query("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return row !== null && typeof row === 'object' && 'present' in row;
}
