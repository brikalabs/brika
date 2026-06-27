/**
 * Covers auto_vacuum + the one-time reclaim. The factory must keep DB files
 * from accumulating dead pages the way the pre-auto_vacuum logs.db did
 * (200 MB+ of which ~88% was free space).
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineDatabase, incrementalVacuum } from './database';

type EmptySchema = Record<string, never>;
const SCHEMA: EmptySchema = {};

function migration(hash: string, sql: string[]) {
  return { idx: 0, hash, folderMillis: 1000, sql, bps: true };
}

function pragmaInt(
  sqlite: { query: (q: string) => { get: () => unknown } },
  pragma: string
): number {
  const row = sqlite.query(`PRAGMA ${pragma}`).get();
  if (row !== null && typeof row === 'object') {
    const v = Object.values(row)[0];
    return typeof v === 'number' ? v : 0;
  }
  return 0;
}

describe('factory vacuum', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'brika-vacuum-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('a fresh DB has auto_vacuum = INCREMENTAL', () => {
    const { sqlite } = defineDatabase('fresh', SCHEMA, []).open(join(dir, 'fresh.db'));
    // 0 = none, 1 = full, 2 = incremental
    expect(pragmaInt(sqlite, 'auto_vacuum')).toBe(2);
    sqlite.close();
  });

  test('incrementalVacuum runs without error', () => {
    const { sqlite } = defineDatabase('iv', SCHEMA, []).open(join(dir, 'iv.db'));
    expect(() => incrementalVacuum(sqlite)).not.toThrow();
    sqlite.close();
  });

  test('reopening a bloated DB reclaims free pages and shrinks the file', () => {
    const path = join(dir, 'bloat.db');
    const open = () =>
      defineDatabase('bloat', SCHEMA, [
        migration('h0', [
          'CREATE TABLE IF NOT EXISTS blob_data (id INTEGER PRIMARY KEY, data BLOB)',
        ]),
      ]).open(path);

    // Fill ~12 MiB, then delete it all. With incremental auto_vacuum the freed
    // pages sit on the freelist (the file does NOT shrink on its own).
    const first = open();
    const big = new Uint8Array(4096);
    const insert = first.sqlite.prepare<unknown, [Uint8Array]>(
      'INSERT INTO blob_data (data) VALUES (?)'
    );
    first.sqlite.transaction(() => {
      for (let i = 0; i < 3000; i += 1) {
        insert.run(big);
      }
    })();
    first.sqlite.run('DELETE FROM blob_data');
    const freeBefore = pragmaInt(first.sqlite, 'freelist_count');
    expect(freeBefore).toBeGreaterThan(2000);
    first.sqlite.close();
    // Measure AFTER close so the WAL is checkpointed into the main .db file.
    const sizeBefore = statSync(path).size;

    // Reopening triggers the one-time reclaim VACUUM.
    const second = open();
    expect(pragmaInt(second.sqlite, 'freelist_count')).toBeLessThan(100);
    second.sqlite.close();
    expect(statSync(path).size).toBeLessThan(sizeBefore);
  });
});
