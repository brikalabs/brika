/**
 * End-to-end coverage of `defineDatabase(...).open()`: SQL + code
 * migrations applied on open, idempotency across reopens, and the
 * `:memory:` path. Runner internals (ledger, legacy seed, transactions)
 * are covered in `migrator.integration.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineDatabase } from './database';
import { defineMigration, type SqlMigration } from './migration';
import { LEDGER_TABLE } from './migrator';

type EmptySchema = Record<string, never>;
const SCHEMA: EmptySchema = {};

function sql(tag: string, hash: string, statements: string[]): SqlMigration {
  return { kind: 'sql', tag, hash, statements };
}

describe('defineDatabase().open()', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'brika-db-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('runs pending migrations in tag order and records them in the ledger', () => {
    const path = join(dir, 'fresh.db');
    const { sqlite } = defineDatabase('fresh', SCHEMA, [
      sql('0000_foo', 'h0', ['CREATE TABLE foo (id INTEGER)']),
      sql('0001_bar', 'h1', ['CREATE TABLE bar (id INTEGER)']),
    ]).open(path);

    const tags = sqlite
      .query<{ tag: string }, []>(`SELECT tag FROM ${LEDGER_TABLE} ORDER BY tag`)
      .all()
      .map((r) => r.tag);
    expect(tags).toEqual(['0000_foo', '0001_bar']);
    sqlite.close();
  });

  test('skips already-applied migrations on reopen', () => {
    const path = join(dir, 'reopen.db');
    const migrations = [sql('0000_foo', 'h0', ['CREATE TABLE foo (id INTEGER)'])];

    const first = defineDatabase('reopen', SCHEMA, migrations).open(path);
    first.sqlite.close();

    // Reopening with the same migration must not re-run the CREATE TABLE
    // (which would throw "table foo already exists").
    const second = defineDatabase('reopen', SCHEMA, migrations).open(path);
    const count = second.sqlite
      .query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM ${LEDGER_TABLE}`)
      .get();
    expect(count?.n).toBe(1);
    second.sqlite.close();
  });

  test('runs a code migration with access to the Drizzle handle and raw sqlite', () => {
    const path = join(dir, 'code.db');
    const { sqlite } = defineDatabase('code', SCHEMA, [
      sql('0000_init', 'h0', ['CREATE TABLE counters (id INTEGER PRIMARY KEY, n INTEGER)']),
      defineMigration('0001_seed_counter', ({ sqlite: raw }) => {
        raw.run('INSERT INTO counters (n) VALUES (41)');
      }),
      defineMigration('0002_bump_counter', ({ db }) => {
        // Exercise the Drizzle handle (raw SQL via the query builder).
        db.run('UPDATE counters SET n = n + 1');
      }),
    ]).open(path);

    const row = sqlite.query<{ n: number }, []>('SELECT n FROM counters').get();
    expect(row?.n).toBe(42);
    sqlite.close();
  });

  test('supports the :memory: path', () => {
    const { sqlite } = defineDatabase('mem', SCHEMA, [
      sql('0000_init', 'h0', ['CREATE TABLE t (id INTEGER)']),
    ]).open(':memory:');
    const tables = sqlite
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE name='t'")
      .all();
    expect(tables).toHaveLength(1);
    sqlite.close();
  });
});
