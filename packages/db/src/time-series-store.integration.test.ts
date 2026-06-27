/**
 * Contract test for the shared TimeSeriesStore base, exercised through a minimal
 * concrete subclass: buffered enqueue/flush, synchronous insert, retention prune
 * (which also reclaims pages), and close-drains-the-buffer.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { integer, lt, sqliteTable } from '.';
import { type BrikaDatabase, defineDatabase } from './database';
import { TimeSeriesStore } from './time-series-store';

const t = sqliteTable('t', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ts: integer('ts').notNull(),
});

type TSchema = { t: typeof t };
type Row = { ts: number };

const definition = defineDatabase('tss', { t }, [
  {
    hash: 'h0',
    folderMillis: 1,
    sql: [
      'CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL)',
    ],
    bps: true,
  },
]);

class TestStore extends TimeSeriesStore<Row, TSchema> {
  readonly #path: string;
  constructor(path: string) {
    super();
    this.#path = path;
  }
  protected openDatabase(): BrikaDatabase<TSchema> {
    return definition.open(this.#path);
  }
  protected writeRow(event: Row): void {
    this.db?.insert(t).values({ ts: event.ts }).run();
  }
  protected deleteOlderThan(cutoff: number): number {
    return this.db?.delete(t).where(lt(t.ts, cutoff)).returning({ id: t.id }).all().length ?? 0;
  }
  rowCount(): number {
    return this.db?.select().from(t).all().length ?? 0;
  }
}

describe('TimeSeriesStore', () => {
  let dir: string;
  let store: TestStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'brika-tss-'));
    store = new TestStore(join(dir, 'tss.db'));
    store.init();
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test('insert persists immediately (read-after-write)', () => {
    store.insert({ ts: 1000 });
    expect(store.rowCount()).toBe(1);
  });

  test('enqueue buffers and flush persists in one batch', async () => {
    store.enqueue({ ts: 1 });
    store.enqueue({ ts: 2 });
    // Buffered: not yet on disk until the next tick / explicit flush.
    expect(store.rowCount()).toBe(0);
    store.flush();
    expect(store.rowCount()).toBe(2);
  });

  test('enqueue auto-flushes on the next tick', async () => {
    store.enqueue({ ts: 1 });
    await new Promise((r) => setTimeout(r, 5));
    expect(store.rowCount()).toBe(1);
  });

  test('pruneOlderThan deletes rows below the cutoff and returns the count', () => {
    store.insert({ ts: 100 });
    store.insert({ ts: 200 });
    store.insert({ ts: 300 });
    expect(store.pruneOlderThan(250)).toBe(2);
    expect(store.rowCount()).toBe(1);
  });

  test('startRetention prunes immediately on start', () => {
    const now = Date.now();
    store.insert({ ts: now - 10 * 24 * 60 * 60 * 1000 }); // 10 days old
    store.insert({ ts: now }); // fresh
    store.startRetention(7, 60_000); // keep 7 days; sweeps once now
    store.stopRetention();
    expect(store.rowCount()).toBe(1);
  });

  test('close() drains the buffer so a clean stop loses nothing', () => {
    store.enqueue({ ts: 1 });
    store.enqueue({ ts: 2 });
    store.close();
    // Reopen and confirm both buffered rows reached disk.
    const reopened = new TestStore(join(dir, 'tss.db'));
    reopened.init();
    expect(reopened.rowCount()).toBe(2);
    reopened.close();
  });
});
