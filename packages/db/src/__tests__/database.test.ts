/**
 * Covers the migration runner. The key invariant: pending migrations are
 * decided by *hash*, not by `folderMillis`. A journal `when` value can
 * shift across rebases — we must not re-run an applied migration just
 * because its recorded timestamp falls behind the journal's new one.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineDatabase } from '../database';

type EmptySchema = Record<string, never>;
const SCHEMA: EmptySchema = {};

function migration(idx: number, hash: string, folderMillis: number, sql: string[]) {
  return { idx, hash, folderMillis, sql, bps: true };
}

describe('applyMigrations', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'brika-db-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('runs pending migrations in order and records their hashes', () => {
    const path = join(dir, 'fresh.db');
    const { sqlite } = defineDatabase('fresh', SCHEMA, [
      migration(0, 'h0', 1000, ['CREATE TABLE foo (id INTEGER)']),
      migration(1, 'h1', 2000, ['CREATE TABLE bar (id INTEGER)']),
    ]).open(path);

    const rows = sqlite
      .query<{ hash: string; created_at: number }, []>(
        'SELECT hash, created_at FROM __drizzle_migrations ORDER BY id'
      )
      .all();
    expect(rows.map((r) => r.hash)).toEqual(['h0', 'h1']);
    expect(rows.map((r) => r.created_at)).toEqual([1000, 2000]);
    sqlite.close();
  });

  test('skips a migration whose hash is already recorded', () => {
    const path = join(dir, 'prefilled.db');

    // First open: empty migrations list, set up the table by hand so we
    // control the recorded hash.
    const first = defineDatabase('prefilled', SCHEMA, []).open(path);
    first.sqlite.run('CREATE TABLE foo (id INTEGER, extra TEXT)');
    first.sqlite.run(
      "INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('h-existing', 1000)"
    );
    first.sqlite.close();

    // Second open: a migration with the same hash but a *later* folderMillis
    // (simulating a journal `when` bump after a rebase). The SQL would error
    // with "duplicate column" if re-applied — the dedup must skip it.
    const second = defineDatabase('prefilled', SCHEMA, [
      migration(0, 'h-existing', 5000, ['ALTER TABLE foo ADD COLUMN extra TEXT']),
    ]).open(path);

    const rows = second.sqlite
      .query<{ hash: string; created_at: number }, []>(
        'SELECT hash, created_at FROM __drizzle_migrations ORDER BY id'
      )
      .all();
    expect(rows).toEqual([{ hash: 'h-existing', created_at: 1000 }]);
    second.sqlite.close();
  });

  test('applies a new hash even when its folderMillis is below the latest recorded one', () => {
    const path = join(dir, 'out-of-order.db');

    const first = defineDatabase('out-of-order', SCHEMA, []).open(path);
    first.sqlite.run("INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('h-old', 9000)");
    first.sqlite.close();

    const second = defineDatabase('out-of-order', SCHEMA, [
      migration(0, 'h-old', 9000, []),
      migration(1, 'h-new', 1000, ['CREATE TABLE late (id INTEGER)']),
    ]).open(path);

    const tables = second.sqlite
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='late'"
      )
      .all();
    expect(tables).toHaveLength(1);
    second.sqlite.close();
  });
});
