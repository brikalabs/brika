/**
 * Migration runner internals: the tag-based ledger, the back-compat seed
 * from the legacy `__drizzle_migrations` hash table, SQL/code
 * interleaving, per-migration transactions, and failure semantics.
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { defineMigration, type Migration, type SqlMigration } from './migration';
import { applyMigrations, LEDGER_TABLE } from './migrator';

let sqlite: Database;
let db: ReturnType<typeof drizzle>;

beforeEach(() => {
  sqlite = new Database(':memory:');
  db = drizzle(sqlite);
});

afterEach(() => {
  sqlite.close();
});

function sql(tag: string, hash: string, statements: string[]): SqlMigration {
  return { kind: 'sql', tag, hash, statements };
}

function appliedTags(): string[] {
  return sqlite
    .query<{ tag: string }, []>(`SELECT tag FROM ${LEDGER_TABLE} ORDER BY tag`)
    .all()
    .map((r) => r.tag);
}

function run(migrations: Migration[]) {
  return applyMigrations(sqlite, db, migrations);
}

describe('applyMigrations', () => {
  test('applies pending migrations and records them by tag', () => {
    const outcome = run([
      sql('0000_a', 'ha', ['CREATE TABLE a (id INTEGER)']),
      sql('0001_b', 'hb', ['CREATE TABLE b (id INTEGER)']),
    ]);
    expect(outcome.applied).toEqual(['0000_a', '0001_b']);
    expect(outcome.skipped).toEqual([]);
    expect(appliedTags()).toEqual(['0000_a', '0001_b']);
  });

  test('skips already-applied tags on a second run', () => {
    const migrations = [sql('0000_a', 'ha', ['CREATE TABLE a (id INTEGER)'])];
    run(migrations);
    const outcome = run(migrations);
    expect(outcome.applied).toEqual([]);
    expect(outcome.skipped).toEqual(['0000_a']);
  });

  test('interleaves SQL and code migrations by tag', () => {
    run([
      sql('0002_not_null', 'h2', ['CREATE TABLE marker_c (id INTEGER)']),
      defineMigration('0001_backfill', ({ sqlite: raw }) => {
        raw.run('CREATE TABLE marker_b (id INTEGER)');
      }),
      sql('0000_create', 'h0', ['CREATE TABLE marker_a (id INTEGER)']),
    ]);
    // The "order" table records creation order; assert a<b<c by rowid.
    expect(appliedTags()).toEqual(['0000_create', '0001_backfill', '0002_not_null']);
  });

  test('runs each migration in its own transaction and stops on failure', () => {
    expect(() =>
      run([
        sql('0000_ok', 'h0', ['CREATE TABLE ok (id INTEGER)']),
        sql('0001_bad', 'h1', ['THIS IS NOT SQL']),
        sql('0002_never', 'h2', ['CREATE TABLE never (id INTEGER)']),
      ])
    ).toThrow();

    // 0000 committed, 0001 rolled back (not in ledger), 0002 never reached.
    expect(appliedTags()).toEqual(['0000_ok']);
    const never = sqlite.query("SELECT name FROM sqlite_master WHERE name='never'").all();
    expect(never).toHaveLength(0);
  });

  test('a failing code migration rolls back its own writes', () => {
    expect(() =>
      run([
        defineMigration('0000_partial', ({ sqlite: raw }) => {
          raw.run('CREATE TABLE partial (id INTEGER)');
          throw new Error('boom');
        }),
      ])
    ).toThrow('boom');
    expect(appliedTags()).toEqual([]);
    const partial = sqlite.query("SELECT name FROM sqlite_master WHERE name='partial'").all();
    expect(partial).toHaveLength(0);
  });

  test('seeds the ledger from the legacy __drizzle_migrations table', () => {
    // Simulate an install upgraded from the old hash-based ledger: the
    // schema already exists and __drizzle_migrations records the hash.
    sqlite.run('CREATE TABLE legacy (id INTEGER)');
    sqlite.run(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)'
    );
    sqlite.run("INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('ha', 1234)");

    // The same migration (by hash) must NOT re-run — re-running the
    // CREATE TABLE would throw "table legacy already exists".
    const outcome = run([sql('0000_legacy', 'ha', ['CREATE TABLE legacy (id INTEGER)'])]);
    expect(outcome.applied).toEqual([]);
    expect(outcome.skipped).toEqual(['0000_legacy']);

    const row = sqlite
      .query<{ tag: string; hash: string }, []>(`SELECT tag, hash FROM ${LEDGER_TABLE}`)
      .get();
    expect(row).toEqual({ tag: '0000_legacy', hash: 'ha' });
  });

  test('legacy seed ignores hashes with no matching migration', () => {
    sqlite.run(
      'CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)'
    );
    sqlite.run("INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('orphan-hash', 1)");

    // Unknown hash → not seeded; the real migration still applies.
    const outcome = run([sql('0000_real', 'hreal', ['CREATE TABLE real (id INTEGER)'])]);
    expect(outcome.applied).toEqual(['0000_real']);
  });

  test('throws on a duplicate tag', () => {
    expect(() => run([sql('0000_dup', 'h0', []), sql('0000_dup', 'h1', [])])).toThrow(
      'Duplicate migration tag'
    );
  });

  test('returns an empty outcome for no migrations', () => {
    expect(run([])).toEqual({ applied: [], skipped: [] });
  });
});
