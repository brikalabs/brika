/**
 * Tests for LogStore
 * Testing SQLite-based log storage
 */
import 'reflect-metadata';
import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureDatabases } from '@brika/db';
import { get, reset, useTestBed } from '@brika/di/testing';
import { type LogQueryParams, LogStore } from '@/runtime/logs/log-store';
import type { LogEvent } from '@/runtime/logs/types';

useTestBed({
  autoStub: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const createLogEvent = (overrides: Partial<LogEvent> = {}): LogEvent => ({
  ts: Date.now(),
  level: 'info',
  source: 'hub',
  message: 'Test message',
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('LogStore', () => {
  let store: LogStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'brika-log-test-'));
    configureDatabases(tempDir);

    store = get(LogStore);
    store.init();
  });

  afterEach(async () => {
    store.close();
    reset();
    // Cleanup temp directory
    await rm(tempDir, {
      recursive: true,
      force: true,
    });
  });

  describe('init', () => {
    test('creates database file', async () => {
      expect(await Bun.file(join(tempDir, 'db', 'logs.db')).exists()).toBe(true);
    });

    test('creates logs table with correct schema', () => {
      const db = new Database(join(tempDir, 'db', 'logs.db'));
      const columns = db.query('PRAGMA table_info(logs)').all() as { name: string }[];
      const names = columns.map((c) => c.name);

      expect(names).toContain('id');
      expect(names).toContain('ts');
      expect(names).toContain('level');
      expect(names).toContain('source');
      expect(names).toContain('plugin_name');
      expect(names).toContain('message');
      expect(names).toContain('meta');
      expect(names).toContain('error_name');
      expect(names).toContain('error_message');
      expect(names).toContain('error_stack');
      expect(names).toContain('error_cause');
      db.close();
    });

    test('creates indexes for efficient queries', () => {
      const db = new Database(join(tempDir, 'db', 'logs.db'));
      const indexes = db.query("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[];
      const names = indexes.map((i) => i.name);

      expect(names).toContain('idx_logs_ts');
      expect(names).toContain('idx_logs_level');
      expect(names).toContain('idx_logs_source');
      expect(names).toContain('idx_logs_plugin');
      db.close();
    });
  });

  describe('insert', () => {
    test('inserts basic log event', () => {
      const event = createLogEvent({
        message: 'Test insert',
      });
      store.insert(event);

      const result = store.query();
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].message).toBe('Test insert');
    });

    test('inserts log with metadata', () => {
      const event = createLogEvent({
        message: 'With meta',
        meta: {
          key: 'value',
          count: 42,
        },
      });
      store.insert(event);

      const result = store.query();
      expect(result.logs[0].meta).toEqual({
        key: 'value',
        count: 42,
      });
    });

    test('inserts log with plugin name', () => {
      const event = createLogEvent({
        pluginName: '@test/plugin',
      });
      store.insert(event);

      const result = store.query();
      expect(result.logs[0].pluginName).toBe('@test/plugin');
    });

    test('inserts log with error', () => {
      const event = createLogEvent({
        level: 'error',
        message: 'Error occurred',
        error: {
          name: 'TypeError',
          message: 'Cannot read property',
          stack: 'at test.ts:1',
          cause: 'undefined value',
        },
      });
      store.insert(event);

      const result = store.query();
      expect(result.logs[0].error).toEqual({
        name: 'TypeError',
        message: 'Cannot read property',
        stack: 'at test.ts:1',
        cause: 'undefined value',
      });
    });

    test('handles null plugin name', () => {
      const event = createLogEvent({
        pluginName: undefined,
      });
      store.insert(event);

      const result = store.query();
      expect(result.logs[0].pluginName).toBeUndefined();
    });
  });

  describe('query', () => {
    beforeEach(() => {
      // Insert test data
      store.insert(
        createLogEvent({
          ts: 1000,
          level: 'info',
          source: 'hub',
          message: 'Info 1',
        })
      );
      store.insert(
        createLogEvent({
          ts: 2000,
          level: 'warn',
          source: 'plugin',
          message: 'Warn 1',
          pluginName: '@test/a',
        })
      );
      store.insert(
        createLogEvent({
          ts: 3000,
          level: 'error',
          source: 'hub',
          message: 'Error 1',
        })
      );
      store.insert(
        createLogEvent({
          ts: 4000,
          level: 'info',
          source: 'plugin',
          message: 'Info 2',
          pluginName: '@test/b',
        })
      );
      store.insert(
        createLogEvent({
          ts: 5000,
          level: 'debug',
          source: 'workflow',
          message: 'Debug 1',
        })
      );
    });

    test('returns all logs by default', () => {
      const result = store.query();
      expect(result.logs).toHaveLength(5);
    });

    test('returns logs in descending order by default', () => {
      const result = store.query();
      expect(result.logs[0].ts).toBe(5000);
      expect(result.logs[4].ts).toBe(1000);
    });

    test('supports ascending order', () => {
      const result = store.query({
        order: 'asc',
      });
      expect(result.logs[0].ts).toBe(1000);
      expect(result.logs[4].ts).toBe(5000);
    });

    test('filters by single level', () => {
      const result = store.query({
        level: 'info',
      });
      expect(result.logs).toHaveLength(2);
      expect(result.logs.every((l) => l.level === 'info')).toBe(true);
    });

    test('filters by multiple levels', () => {
      const result = store.query({
        level: ['info', 'warn'],
      });
      expect(result.logs).toHaveLength(3);
    });

    test('filters by single source', () => {
      const result = store.query({
        source: 'hub',
      });
      expect(result.logs).toHaveLength(2);
      expect(result.logs.every((l) => l.source === 'hub')).toBe(true);
    });

    test('filters by multiple sources', () => {
      const result = store.query({
        source: ['hub', 'plugin'],
      });
      expect(result.logs).toHaveLength(4);
    });

    test('filters by plugin name', () => {
      const result = store.query({
        pluginName: '@test/a',
      });
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].pluginName).toBe('@test/a');
    });

    test('filters by search term', () => {
      const result = store.query({
        search: 'Info',
      });
      expect(result.logs).toHaveLength(2);
    });

    test('filters by start timestamp', () => {
      const result = store.query({
        startTs: 3000,
      });
      expect(result.logs).toHaveLength(3);
      expect(result.logs.every((l) => l.ts >= 3000)).toBe(true);
    });

    test('filters by end timestamp', () => {
      const result = store.query({
        endTs: 3000,
      });
      expect(result.logs).toHaveLength(3);
      expect(result.logs.every((l) => l.ts <= 3000)).toBe(true);
    });

    test('filters by timestamp range', () => {
      const result = store.query({
        startTs: 2000,
        endTs: 4000,
      });
      expect(result.logs).toHaveLength(3);
    });

    test('combines multiple filters', () => {
      const result = store.query({
        level: 'info',
        source: 'plugin',
      });
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].message).toBe('Info 2');
    });

    test('respects limit', () => {
      const result = store.query({
        limit: 2,
      });
      expect(result.logs).toHaveLength(2);
    });

    test('caps limit at 1000', () => {
      // Insert many logs
      for (let i = 0; i < 1100; i++) {
        store.insert(
          createLogEvent({
            message: `Log ${i}`,
          })
        );
      }

      const result = store.query({
        limit: 2000,
      });
      expect(result.logs.length).toBeLessThanOrEqual(1000);
    });

    test('supports cursor-based pagination (desc)', () => {
      const first = store.query({
        limit: 2,
      });
      expect(first.logs).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();

      if (!first.nextCursor) {
        throw new Error('Expected nextCursor to be defined');
      }
      const second = store.query({
        limit: 2,
        cursor: first.nextCursor,
      });
      expect(second.logs).toHaveLength(2);
      expect(second.logs[0].id).toBeLessThan(first.logs[1].id);
    });

    test('supports cursor-based pagination (asc)', () => {
      const first = store.query({
        limit: 2,
        order: 'asc',
      });
      expect(first.logs).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();

      if (!first.nextCursor) {
        throw new Error('Expected nextCursor to be defined');
      }
      const second = store.query({
        limit: 2,
        order: 'asc',
        cursor: first.nextCursor,
      });
      expect(second.logs).toHaveLength(2);
      expect(second.logs[0].id).toBeGreaterThan(first.logs[1].id);
    });

    test('returns null cursor when no more results', () => {
      const result = store.query({
        limit: 10,
      });
      expect(result.nextCursor).toBeNull();
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      store.insert(
        createLogEvent({
          ts: 1000,
          level: 'info',
          source: 'hub',
        })
      );
      store.insert(
        createLogEvent({
          ts: 2000,
          level: 'warn',
          source: 'plugin',
          pluginName: '@test/a',
        })
      );
      store.insert(
        createLogEvent({
          ts: 3000,
          level: 'error',
          source: 'hub',
        })
      );
    });

    test('clears all logs when no params', () => {
      const deleted = store.clear();
      expect(deleted).toBe(3);
      expect(store.count()).toBe(0);
    });

    test('clears by level', () => {
      const deleted = store.clear({
        level: 'info',
      });
      expect(deleted).toBe(1);
      expect(store.count()).toBe(2);
    });

    test('clears by multiple levels', () => {
      const deleted = store.clear({
        level: ['info', 'warn'],
      });
      expect(deleted).toBe(2);
      expect(store.count()).toBe(1);
    });

    test('clears by source', () => {
      const deleted = store.clear({
        source: 'hub',
      });
      expect(deleted).toBe(2);
      expect(store.count()).toBe(1);
    });

    test('clears by plugin name', () => {
      const deleted = store.clear({
        pluginName: '@test/a',
      });
      expect(deleted).toBe(1);
      expect(store.count()).toBe(2);
    });

    test('clears by timestamp range', () => {
      const deleted = store.clear({
        startTs: 2000,
        endTs: 2000,
      });
      expect(deleted).toBe(1);
      expect(store.count()).toBe(2);
    });
  });

  describe('getPluginNames', () => {
    test('returns empty array when no plugins', () => {
      store.insert(createLogEvent({}));
      expect(store.getPluginNames()).toEqual([]);
    });

    test('returns distinct plugin names', () => {
      store.insert(
        createLogEvent({
          pluginName: '@test/a',
        })
      );
      store.insert(
        createLogEvent({
          pluginName: '@test/b',
        })
      );
      store.insert(
        createLogEvent({
          pluginName: '@test/a',
        })
      );

      const names = store.getPluginNames();
      expect(names).toHaveLength(2);
      expect(names).toContain('@test/a');
      expect(names).toContain('@test/b');
    });

    test('returns sorted plugin names', () => {
      store.insert(
        createLogEvent({
          pluginName: '@test/z',
        })
      );
      store.insert(
        createLogEvent({
          pluginName: '@test/a',
        })
      );

      const names = store.getPluginNames();
      expect(names[0]).toBe('@test/a');
      expect(names[1]).toBe('@test/z');
    });
  });

  describe('getSources', () => {
    test('returns empty array when no logs', () => {
      expect(store.getSources()).toEqual([]);
    });

    test('returns distinct sources', () => {
      store.insert(
        createLogEvent({
          source: 'hub',
        })
      );
      store.insert(
        createLogEvent({
          source: 'plugin',
        })
      );
      store.insert(
        createLogEvent({
          source: 'hub',
        })
      );

      const sources = store.getSources();
      expect(sources).toHaveLength(2);
      expect(sources).toContain('hub');
      expect(sources).toContain('plugin');
    });
  });

  describe('count', () => {
    test('returns 0 when empty', () => {
      expect(store.count()).toBe(0);
    });

    test('returns correct count', () => {
      store.insert(createLogEvent({}));
      store.insert(createLogEvent({}));
      store.insert(createLogEvent({}));

      expect(store.count()).toBe(3);
    });
  });

  describe('error handling', () => {
    test('insert does nothing before init', () => {
      const uninitStore = new LogStore();
      // Should not throw
      uninitStore.insert(createLogEvent({}));
    });

    test('query returns empty before init', () => {
      const uninitStore = new LogStore();
      const result = uninitStore.query();
      expect(result.logs).toEqual([]);
      expect(result.nextCursor).toBeNull();
    });

    test('clear returns 0 before init', () => {
      const uninitStore = new LogStore();
      expect(uninitStore.clear()).toBe(0);
    });

    test('getPluginNames returns empty before init', () => {
      const uninitStore = new LogStore();
      expect(uninitStore.getPluginNames()).toEqual([]);
    });

    test('getSources returns empty before init', () => {
      const uninitStore = new LogStore();
      expect(uninitStore.getSources()).toEqual([]);
    });

    test('count returns 0 before init', () => {
      const uninitStore = new LogStore();
      expect(uninitStore.count()).toBe(0);
    });
  });
});
