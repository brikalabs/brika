/**
 * Tests for EventStore — SQLite-backed capture-event storage.
 */
import 'reflect-metadata';
import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureDatabases } from '@brika/db';
import { get, reset, useTestBed } from '@brika/di/testing';
import { type EventQueryParams, EventStore } from '@/runtime/analytics/event-store';
import type { CaptureEvent } from '@/runtime/analytics/types';

useTestBed({ autoStub: false });

const createEvent = (overrides: Partial<CaptureEvent> = {}): CaptureEvent => ({
  ts: Date.now(),
  name: 'feature.used',
  source: 'hub',
  ...overrides,
});

describe('EventStore', () => {
  let store: EventStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'brika-event-test-'));
    configureDatabases(tempDir);
    store = get(EventStore);
    store.init();
  });

  afterEach(async () => {
    store.close();
    reset();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('init', () => {
    test('creates events table with the expected schema', () => {
      const db = new Database(join(tempDir, 'db', 'events.db'));
      const columns = db.query('PRAGMA table_info(events)').all() as { name: string }[];
      const names = columns.map((c) => c.name);
      for (const col of ['id', 'ts', 'name', 'source', 'distinct_id', 'plugin_name', 'props']) {
        expect(names).toContain(col);
      }
      db.close();
    });
  });

  describe('insert + query', () => {
    test('round-trips an event with props', () => {
      store.insert(createEvent({ name: 'workflow.created', props: { count: 3, kind: 'auto' } }));
      const result = store.query();
      expect(result.events).toHaveLength(1);
      expect(result.events[0].name).toBe('workflow.created');
      expect(result.events[0].props).toEqual({ count: 3, kind: 'auto' });
    });

    test('filters by name and source', () => {
      store.insert(createEvent({ ts: 1000, name: 'a.used', source: 'ui' }));
      store.insert(createEvent({ ts: 2000, name: 'b.used', source: 'plugin', pluginName: '@x/y' }));
      store.insert(createEvent({ ts: 3000, name: 'a.used', source: 'hub' }));

      expect(store.query({ name: 'a.used' }).events).toHaveLength(2);
      expect(store.query({ source: 'plugin' }).events).toHaveLength(1);
      expect(store.query({ pluginName: '@x/y' }).events[0].name).toBe('b.used');
    });

    test('orders descending by default and supports cursor paging', () => {
      for (let i = 1; i <= 5; i++) {
        store.insert(createEvent({ ts: i * 1000, name: `e${i}` }));
      }
      const first = store.query({ limit: 2 });
      expect(first.events).toHaveLength(2);
      expect(first.events[0].ts).toBe(5000);
      expect(first.nextCursor).not.toBeNull();

      const second = store.query({ limit: 2, cursor: first.nextCursor ?? undefined });
      expect(second.events[0].id).toBeLessThan(first.events[1].id);
    });
  });

  describe('enqueue + flush', () => {
    test('batched events are visible after an explicit flush', () => {
      store.enqueue(createEvent({ name: 'batched.one' }));
      store.enqueue(createEvent({ name: 'batched.two' }));
      // Not yet flushed (deferred to the timer); force it.
      store.flush();
      expect(store.count()).toBe(2);
    });
  });

  describe('topNames', () => {
    test('returns names ordered by frequency', () => {
      store.insert(createEvent({ name: 'hot' }));
      store.insert(createEvent({ name: 'hot' }));
      store.insert(createEvent({ name: 'cold' }));
      const names = store.topNames();
      expect(names[0]).toEqual({ name: 'hot', count: 2 });
      expect(names).toContainEqual({ name: 'cold', count: 1 });
    });
  });

  describe('clear', () => {
    test('clears by source', () => {
      store.insert(createEvent({ source: 'ui' }));
      store.insert(createEvent({ source: 'hub' }));
      const deleted = store.clear({ source: 'ui' } as Partial<EventQueryParams>);
      expect(deleted).toBe(1);
      expect(store.count()).toBe(1);
    });
  });

  describe('pruneOlderThan', () => {
    test('drops rows older than the cutoff', () => {
      store.insert(createEvent({ ts: 1000 }));
      store.insert(createEvent({ ts: 5000 }));
      const removed = store.pruneOlderThan(3000);
      expect(removed).toBe(1);
      expect(store.count()).toBe(1);
    });
  });

  describe('error handling', () => {
    test('degrades gracefully before init', () => {
      const uninit = new EventStore();
      expect(() => uninit.insert(createEvent())).not.toThrow();
      expect(uninit.query().events).toEqual([]);
      expect(uninit.count()).toBe(0);
    });
  });
});
