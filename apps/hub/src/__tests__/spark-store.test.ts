import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { container } from '@brika/di';
import { useTestBed } from '@brika/di/testing';
import { ConfigLoader } from '@/runtime/config/config-loader';
import { SparkStore, type StoredSparkEvent } from '@/runtime/sparks/spark-store';

const di = useTestBed();

const createTestEvent = (
  overrides: Partial<Omit<StoredSparkEvent, 'id'>> = {}
): Omit<StoredSparkEvent, 'id'> => ({
  ts: Date.now(),
  type: 'test.event',
  source: 'test-source',
  pluginId: null,
  payload: { key: 'value' },
  ...overrides,
});

describe('SparkStore', () => {
  let store: SparkStore;
  let tempDir: string;

  beforeEach(async () => {
    container.reset();

    tempDir = await mkdtemp(join(tmpdir(), 'spark-store-test-'));

    di.stub(ConfigLoader, {
      getRootDir: () => tempDir,
    });

    store = di.inject(SparkStore);
    await store.init();
  });

  afterEach(() => {
    store.close();
    container.reset();

    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('insert', () => {
    test('should insert a spark event', () => {
      const event = createTestEvent();

      store.insert(event);

      const result = store.query();
      expect(result.sparks).toHaveLength(1);
      expect(result.sparks[0]).toMatchObject({
        ts: event.ts,
        type: event.type,
        source: event.source,
        pluginId: event.pluginId,
        payload: event.payload,
      });
    });

    test('should insert event with null payload', () => {
      const event = createTestEvent({ payload: null });

      store.insert(event);

      const result = store.query();
      expect(result.sparks[0].payload).toBeNull();
    });

    test('should insert event with pluginId', () => {
      const event = createTestEvent({ pluginId: '@brika/test-plugin' });

      store.insert(event);

      const result = store.query();
      expect(result.sparks[0].pluginId).toBe('@brika/test-plugin');
    });

    test('should auto-increment id for each event', () => {
      store.insert(createTestEvent());
      store.insert(createTestEvent());
      store.insert(createTestEvent());

      const result = store.query({ order: 'asc' });
      expect(result.sparks[0].id).toBe(1);
      expect(result.sparks[1].id).toBe(2);
      expect(result.sparks[2].id).toBe(3);
    });
  });

  describe('query', () => {
    test('should return empty result when no events exist', () => {
      const result = store.query();

      expect(result.sparks).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });

    test('should return all events with default params', () => {
      store.insert(createTestEvent({ type: 'type.a' }));
      store.insert(createTestEvent({ type: 'type.b' }));
      store.insert(createTestEvent({ type: 'type.c' }));

      const result = store.query();

      expect(result.sparks).toHaveLength(3);
    });

    test('should filter by single type', () => {
      store.insert(createTestEvent({ type: 'type.a' }));
      store.insert(createTestEvent({ type: 'type.b' }));
      store.insert(createTestEvent({ type: 'type.a' }));

      const result = store.query({ type: 'type.a' });

      expect(result.sparks).toHaveLength(2);
      expect(result.sparks.every((s) => s.type === 'type.a')).toBeTrue();
    });

    test('should filter by multiple types', () => {
      store.insert(createTestEvent({ type: 'type.a' }));
      store.insert(createTestEvent({ type: 'type.b' }));
      store.insert(createTestEvent({ type: 'type.c' }));

      const result = store.query({ type: ['type.a', 'type.c'] });

      expect(result.sparks).toHaveLength(2);
      expect(result.sparks.some((s) => s.type === 'type.a')).toBeTrue();
      expect(result.sparks.some((s) => s.type === 'type.c')).toBeTrue();
    });

    test('should filter by single source', () => {
      store.insert(createTestEvent({ source: 'source-a' }));
      store.insert(createTestEvent({ source: 'source-b' }));
      store.insert(createTestEvent({ source: 'source-a' }));

      const result = store.query({ source: 'source-a' });

      expect(result.sparks).toHaveLength(2);
      expect(result.sparks.every((s) => s.source === 'source-a')).toBeTrue();
    });

    test('should filter by multiple sources', () => {
      store.insert(createTestEvent({ source: 'source-a' }));
      store.insert(createTestEvent({ source: 'source-b' }));
      store.insert(createTestEvent({ source: 'source-c' }));

      const result = store.query({ source: ['source-a', 'source-b'] });

      expect(result.sparks).toHaveLength(2);
    });

    test('should filter by pluginId', () => {
      store.insert(createTestEvent({ pluginId: '@brika/plugin-a' }));
      store.insert(createTestEvent({ pluginId: '@brika/plugin-b' }));
      store.insert(createTestEvent({ pluginId: '@brika/plugin-a' }));

      const result = store.query({ pluginId: '@brika/plugin-a' });

      expect(result.sparks).toHaveLength(2);
      expect(result.sparks.every((s) => s.pluginId === '@brika/plugin-a')).toBeTrue();
    });

    test('should filter by timestamp range', () => {
      const now = Date.now();
      store.insert(createTestEvent({ ts: now - 3000 }));
      store.insert(createTestEvent({ ts: now - 2000 }));
      store.insert(createTestEvent({ ts: now - 1000 }));

      const result = store.query({ startTs: now - 2500, endTs: now - 500 });

      expect(result.sparks).toHaveLength(2);
    });

    test('should filter by startTs only', () => {
      const now = Date.now();
      store.insert(createTestEvent({ ts: now - 3000 }));
      store.insert(createTestEvent({ ts: now - 2000 }));
      store.insert(createTestEvent({ ts: now - 1000 }));

      const result = store.query({ startTs: now - 2500 });

      expect(result.sparks).toHaveLength(2);
    });

    test('should filter by endTs only', () => {
      const now = Date.now();
      store.insert(createTestEvent({ ts: now - 3000 }));
      store.insert(createTestEvent({ ts: now - 2000 }));
      store.insert(createTestEvent({ ts: now - 1000 }));

      const result = store.query({ endTs: now - 1500 });

      expect(result.sparks).toHaveLength(2);
    });

    test('should order results ascending', () => {
      store.insert(createTestEvent({ type: 'first' }));
      store.insert(createTestEvent({ type: 'second' }));
      store.insert(createTestEvent({ type: 'third' }));

      const result = store.query({ order: 'asc' });

      expect(result.sparks[0].type).toBe('first');
      expect(result.sparks[2].type).toBe('third');
    });

    test('should order results descending by default', () => {
      store.insert(createTestEvent({ type: 'first' }));
      store.insert(createTestEvent({ type: 'second' }));
      store.insert(createTestEvent({ type: 'third' }));

      const result = store.query();

      expect(result.sparks[0].type).toBe('third');
      expect(result.sparks[2].type).toBe('first');
    });

    test('should limit results', () => {
      for (let i = 0; i < 10; i++) {
        store.insert(createTestEvent());
      }

      const result = store.query({ limit: 5 });

      expect(result.sparks).toHaveLength(5);
      expect(result.nextCursor).not.toBeNull();
    });

    test('should enforce max limit', () => {
      for (let i = 0; i < 5; i++) {
        store.insert(createTestEvent());
      }

      const result = store.query({ limit: 2000 });

      expect(result.sparks).toHaveLength(5);
    });

    test('should support cursor-based pagination descending', () => {
      for (let i = 0; i < 10; i++) {
        store.insert(createTestEvent({ type: `event-${i}` }));
      }

      const page1 = store.query({ limit: 3 });
      expect(page1.sparks).toHaveLength(3);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = store.query({ limit: 3, cursor: page1.nextCursor! });
      expect(page2.sparks).toHaveLength(3);
      expect(page2.sparks[0].id).toBeLessThan(page1.sparks[2].id);

      const page3 = store.query({ limit: 3, cursor: page2.nextCursor! });
      expect(page3.sparks).toHaveLength(3);

      const page4 = store.query({ limit: 3, cursor: page3.nextCursor! });
      expect(page4.sparks).toHaveLength(1);
      expect(page4.nextCursor).toBeNull();
    });

    test('should support cursor-based pagination ascending', () => {
      for (let i = 0; i < 10; i++) {
        store.insert(createTestEvent({ type: `event-${i}` }));
      }

      const page1 = store.query({ limit: 3, order: 'asc' });
      expect(page1.sparks).toHaveLength(3);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = store.query({ limit: 3, cursor: page1.nextCursor!, order: 'asc' });
      expect(page2.sparks).toHaveLength(3);
      expect(page2.sparks[0].id).toBeGreaterThan(page1.sparks[2].id);
    });

    test('should combine multiple filters', () => {
      const now = Date.now();
      store.insert(createTestEvent({ type: 'type.a', source: 'source-a', ts: now - 1000 }));
      store.insert(createTestEvent({ type: 'type.a', source: 'source-b', ts: now - 1000 }));
      store.insert(createTestEvent({ type: 'type.b', source: 'source-a', ts: now - 1000 }));
      store.insert(createTestEvent({ type: 'type.a', source: 'source-a', ts: now - 5000 }));

      const result = store.query({
        type: 'type.a',
        source: 'source-a',
        startTs: now - 2000,
      });

      expect(result.sparks).toHaveLength(1);
    });
  });

  describe('clear', () => {
    test('should clear all events when no params', () => {
      store.insert(createTestEvent());
      store.insert(createTestEvent());
      store.insert(createTestEvent());

      const deleted = store.clear();

      expect(deleted).toBe(3);
      expect(store.count()).toBe(0);
    });

    test('should clear only matching events by type', () => {
      store.insert(createTestEvent({ type: 'type.a' }));
      store.insert(createTestEvent({ type: 'type.b' }));
      store.insert(createTestEvent({ type: 'type.a' }));

      const deleted = store.clear({ type: 'type.a' });

      expect(deleted).toBe(2);
      expect(store.count()).toBe(1);
    });

    test('should clear only matching events by source', () => {
      store.insert(createTestEvent({ source: 'source-a' }));
      store.insert(createTestEvent({ source: 'source-b' }));

      const deleted = store.clear({ source: 'source-a' });

      expect(deleted).toBe(1);
      expect(store.count()).toBe(1);
    });

    test('should clear only matching events by timestamp range', () => {
      const now = Date.now();
      store.insert(createTestEvent({ ts: now - 3000 }));
      store.insert(createTestEvent({ ts: now - 2000 }));
      store.insert(createTestEvent({ ts: now - 1000 }));

      const deleted = store.clear({ startTs: now - 2500, endTs: now - 1500 });

      expect(deleted).toBe(1);
      expect(store.count()).toBe(2);
    });
  });

  describe('getTypes', () => {
    test('should return empty array when no events', () => {
      const types = store.getTypes();

      expect(types).toHaveLength(0);
    });

    test('should return distinct types sorted alphabetically', () => {
      store.insert(createTestEvent({ type: 'type.c' }));
      store.insert(createTestEvent({ type: 'type.a' }));
      store.insert(createTestEvent({ type: 'type.b' }));
      store.insert(createTestEvent({ type: 'type.a' }));

      const types = store.getTypes();

      expect(types).toEqual(['type.a', 'type.b', 'type.c']);
    });
  });

  describe('count', () => {
    test('should return 0 when no events', () => {
      expect(store.count()).toBe(0);
    });

    test('should return total event count', () => {
      store.insert(createTestEvent());
      store.insert(createTestEvent());
      store.insert(createTestEvent());

      expect(store.count()).toBe(3);
    });
  });

  describe('uninitialized store', () => {
    test('should handle insert gracefully when not initialized', () => {
      container.reset();
      di.stub(ConfigLoader);
      const uninitializedStore = di.inject(SparkStore);

      expect(() => uninitializedStore.insert(createTestEvent())).not.toThrow();
    });

    test('should return empty result when not initialized', () => {
      container.reset();
      di.stub(ConfigLoader);
      const uninitializedStore = di.inject(SparkStore);

      const result = uninitializedStore.query();

      expect(result).toEqual({ sparks: [], nextCursor: null });
    });

    test('should return 0 for count when not initialized', () => {
      container.reset();
      di.stub(ConfigLoader);
      const uninitializedStore = di.inject(SparkStore);

      expect(uninitializedStore.count()).toBe(0);
    });

    test('should return empty array for getTypes when not initialized', () => {
      container.reset();
      di.stub(ConfigLoader);
      const uninitializedStore = di.inject(SparkStore);

      expect(uninitializedStore.getTypes()).toEqual([]);
    });

    test('should return 0 for clear when not initialized', () => {
      container.reset();
      di.stub(ConfigLoader);
      const uninitializedStore = di.inject(SparkStore);

      expect(uninitializedStore.clear()).toBe(0);
    });
  });
});
