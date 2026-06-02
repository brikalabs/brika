import { describe, expect, test } from 'bun:test';
import { defineDatabase } from './database';
import { lazyDatabase } from './lazy';

type EmptySchema = Record<string, never>;
const SCHEMA: EmptySchema = {};

function makeLazy(label?: string) {
  // In-memory definition so each test is isolated and needs no data dir.
  const def = defineDatabase('lazy-test', SCHEMA, [
    { kind: 'sql', tag: '0000_init', hash: 'h0', statements: ['CREATE TABLE t (id INTEGER)'] },
  ]);
  return lazyDatabase({ open: (_path?: string) => def.open(':memory:') }, label);
}

describe('lazyDatabase', () => {
  test('is unopened before open()', () => {
    const lazy = makeLazy();
    expect(lazy.opened).toBe(false);
    expect(lazy.dbOrNull).toBeNull();
  });

  test('db throws with the label before open()', () => {
    expect(() => makeLazy('StateStore').db).toThrow('StateStore not opened');
  });

  test('defaults the label to "database"', () => {
    expect(() => makeLazy().db).toThrow('database not opened');
  });

  test('exposes the handle after open()', () => {
    const lazy = makeLazy();
    const handle = lazy.open();
    expect(lazy.opened).toBe(true);
    expect(lazy.db).toBe(handle.db);
    expect(lazy.dbOrNull).toBe(handle.db);
    lazy.close();
  });

  test('runs migrations on open (the table exists)', () => {
    const lazy = makeLazy();
    const { sqlite } = lazy.open();
    const found = sqlite.query("SELECT name FROM sqlite_master WHERE name = 't'").all();
    expect(found).toHaveLength(1);
    lazy.close();
  });

  test('close() resets to unopened and is safe to call when never opened', () => {
    const lazy = makeLazy();
    lazy.close(); // no-op, must not throw
    lazy.open();
    lazy.close();
    expect(lazy.opened).toBe(false);
    expect(lazy.dbOrNull).toBeNull();
  });
});
