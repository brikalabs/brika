/**
 * Migration model — the unit the {@link applyMigrations} runner applies.
 *
 * A database's migration history is an ordered list of migrations, each
 * identified by a sortable `tag` (`NNNN_snake_name`). A migration is
 * either:
 *
 *   - **SQL** — DDL/data statements produced by `drizzle-kit generate`
 *     and loaded at build time by the `loadMigrations` macro. Inlined
 *     into the binary as plain data.
 *
 *   - **code (TS)** — a `run(ctx)` callback authored in TypeScript via
 *     {@link defineMigration}, for data backfills and transforms that
 *     SQL can't express (re-encrypt a column, reshape JSON, derive a new
 *     value from two old ones). It receives the live Drizzle handle and
 *     the raw `bun:sqlite` connection, and runs inside the same
 *     per-migration transaction as a SQL migration.
 *
 * SQL and code migrations interleave by `tag`, so a code migration can
 * sit *between* two schema migrations — e.g. add a column (SQL), backfill
 * it (code), then make it `NOT NULL` (SQL).
 *
 * `run` is intentionally **synchronous**: `bun:sqlite` and Drizzle's
 * bun-sqlite driver are synchronous, so keeping migrations sync lets
 * `.open()` stay synchronous and every migration run inside a real
 * SQLite transaction.
 */

import type { Database } from 'bun:sqlite';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';

/** Drizzle handle handed to code migrations. Schema-agnostic on purpose. */
export type MigrationDatabase = BunSQLiteDatabase<Record<string, unknown>>;

export interface MigrationContext {
  /** Drizzle query builder — use with your imported tables. */
  readonly db: MigrationDatabase;
  /** Raw `bun:sqlite` connection for SQL the query builder can't express. */
  readonly sqlite: Database;
}

export interface SqlMigration {
  readonly kind: 'sql';
  /** `NNNN_snake_name`, matching the `.sql` filename / journal tag. */
  readonly tag: string;
  /** SHA of the SQL body — back-compat key for the legacy ledger seed. */
  readonly hash: string;
  /** Statements to run in order. */
  readonly statements: readonly string[];
}

export interface CodeMigration {
  readonly kind: 'code';
  /** `NNNN_snake_name` — sorts among SQL tags to define interleave order. */
  readonly tag: string;
  /** Applies the migration. Runs inside a transaction; must be synchronous. */
  readonly run: (ctx: MigrationContext) => void;
}

export type Migration = SqlMigration | CodeMigration;

const TAG_PATTERN = /^\d{4}_[a-z0-9]+(?:_[a-z0-9]+)*$/;

/**
 * Author a TypeScript data migration.
 *
 * @example
 * ```ts
 * // migrations/0002_backfill_scores.ts
 * import { defineMigration } from '@brika/db';
 * import { isNull } from '@brika/db';
 * import { widgets } from '../schema';
 *
 * export default defineMigration('0002_backfill_scores', ({ db }) => {
 *   db.update(widgets).set({ score: 0 }).where(isNull(widgets.score)).run();
 * });
 * ```
 *
 * Register it next to the SQL migrations on the database definition:
 *
 * ```ts
 * import backfillScores from './migrations/0002_backfill_scores';
 * export const widgetsDb = defineDatabase('widgets.db', schema, [
 *   ...loadMigrations('packages/x/src/migrations'),
 *   backfillScores,
 * ]);
 * ```
 */
export function defineMigration(tag: string, run: (ctx: MigrationContext) => void): CodeMigration {
  if (!TAG_PATTERN.test(tag)) {
    throw new Error(
      `Invalid migration tag "${tag}": expected NNNN_snake_name (e.g. "0002_backfill_scores").`
    );
  }
  return { kind: 'code', tag, run };
}

/**
 * Validate and sort migrations into apply order. Throws on a duplicate
 * tag — two migrations sharing a tag would make apply order ambiguous
 * and corrupt the ledger (which is keyed by tag).
 */
export function sortMigrations(migrations: readonly Migration[]): Migration[] {
  const seen = new Set<string>();
  for (const migration of migrations) {
    if (seen.has(migration.tag)) {
      throw new Error(`Duplicate migration tag "${migration.tag}".`);
    }
    seen.add(migration.tag);
  }
  // Tags are unique here (duplicates threw above), so a binary comparator
  // is sufficient — the equal case never occurs.
  return [...migrations].sort((a, b) => (a.tag < b.tag ? -1 : 1));
}
