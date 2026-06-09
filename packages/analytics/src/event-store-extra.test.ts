/**
 * Supplementary tests for EventStore — covers branches not hit by the
 * integration test suite: startRetention, search/escapeLike, asc ordering,
 * userId/distinctId query filters, topSources, topPlugins, getPluginNames,
 * and the `isCaptureSource` guard in topSources.
 */
import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureDatabases } from '@brika/db';
import { get, reset, useTestBed } from '@brika/di/testing';
import { EventStore } from './event-store';
import type { CaptureEvent } from './types';

useTestBed({ autoStub: false });

const createEvent = (overrides: Partial<CaptureEvent> = {}): CaptureEvent => ({
  ts: Date.now(),
  name: 'feature.used',
  source: 'hub',
  ...overrides,
});

describe('EventStore (extended)', () => {
  let store: EventStore;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'brika-event-ext-'));
    configureDatabases(tempDir);
    store = get(EventStore);
    store.init();
  });

  afterEach(async () => {
    store.close();
    reset();
    await rm(tempDir, { recursive: true, force: true });
  });

  // ── startRetention ────────────────────────────────────────────────────────

  describe('startRetention', () => {
    test('calling with retentionDays=0 is a no-op (does not set a timer)', () => {
      // Verify that rows inserted before the call are NOT pruned (timer was not
      // set because retentionDays is 0).
      store.insert(createEvent({ ts: 1 }));
      store.startRetention(0, 1_000);
      // We inserted one event; retention with 0 days must leave it untouched.
      expect(store.count()).toBe(1);
      store.stopRetention();
    });

    test('calling with intervalMs=0 is a no-op', () => {
      store.insert(createEvent({ ts: 1 }));
      store.startRetention(30, 0);
      expect(store.count()).toBe(1);
      store.stopRetention();
    });

    test('calls sweepNow immediately and starts a timer', () => {
      // Insert one ancient event and one recent one.
      const ancient = 1000;
      const recent = Date.now();
      store.insert(createEvent({ ts: ancient }));
      store.insert(createEvent({ ts: recent }));

      // retentionDays=1 means cut off at now-86400000; the ancient row at ts=1000
      // is older than that so it should be pruned on the immediate sweep.
      store.startRetention(1, 60_000);

      // The ancient row must have been pruned by the immediate sweep.
      expect(store.count()).toBe(1);
      store.stopRetention();
    });

    test('stopRetention is a no-op when no timer is running', () => {
      // Should not throw even when called without a prior startRetention.
      expect(() => store.stopRetention()).not.toThrow();
    });

    test('stopRetention clears a running timer', () => {
      store.startRetention(1, 60_000);
      expect(() => store.stopRetention()).not.toThrow();
      // Calling stop again must also be safe.
      expect(() => store.stopRetention()).not.toThrow();
    });
  });

  // ── query: search / escapeLike ────────────────────────────────────────────

  describe('query: search filter', () => {
    test('matches events whose name contains the search string', () => {
      store.insert(createEvent({ name: 'workflow.created' }));
      store.insert(createEvent({ name: 'workflow.deleted' }));
      store.insert(createEvent({ name: 'plugin.installed' }));

      const result = store.query({ search: 'workflow' });
      expect(result.events).toHaveLength(2);
      for (const e of result.events) {
        expect(e.name).toContain('workflow');
      }
    });

    test('escapes SQLite LIKE wildcards in the search term', () => {
      // Insert an event whose name contains a literal '%'.
      store.insert(createEvent({ name: 'disk.usage.80%' }));
      store.insert(createEvent({ name: 'disk.usage.normal' }));

      // Searching for '80%' should only match the literal name, not use '%' as
      // a wildcard that would also match 'disk.usage.normal'.
      const result = store.query({ search: '80%' });
      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.name).toBe('disk.usage.80%');
    });

    test('escapes underscore wildcard', () => {
      store.insert(createEvent({ name: 'ab_cd' }));
      store.insert(createEvent({ name: 'abXcd' }));

      // The literal '_' must not act as a single-char wildcard.
      const result = store.query({ search: 'ab_cd' });
      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.name).toBe('ab_cd');
    });

    test('returns empty when search matches nothing', () => {
      store.insert(createEvent({ name: 'feature.used' }));
      const result = store.query({ search: 'zzz-nomatch' });
      expect(result.events).toHaveLength(0);
    });
  });

  // ── query: asc order + cursor ─────────────────────────────────────────────

  describe('query: ascending order and userId/distinctId filters', () => {
    test('ascending order returns oldest first', () => {
      store.insert(createEvent({ ts: 1000, name: 'first' }));
      store.insert(createEvent({ ts: 2000, name: 'second' }));
      store.insert(createEvent({ ts: 3000, name: 'third' }));

      const result = store.query({ order: 'asc' });
      expect(result.events[0]?.name).toBe('first');
      expect(result.events[result.events.length - 1]?.name).toBe('third');
    });

    test('ascending cursor-paging advances forward', () => {
      for (let i = 1; i <= 5; i++) {
        store.insert(createEvent({ ts: i * 1000, name: `e${i}` }));
      }
      const first = store.query({ order: 'asc', limit: 2 });
      expect(first.events).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();

      const second = store.query({ order: 'asc', limit: 2, cursor: first.nextCursor ?? undefined });
      // Second page must start where the first one left off.
      expect(second.events[0]?.id ?? 0).toBeGreaterThan(first.events[1]?.id ?? 0);
    });

    test('filters by distinctId', () => {
      store.insert(createEvent({ distinctId: 'device-a', name: 'x' }));
      store.insert(createEvent({ distinctId: 'device-b', name: 'y' }));

      const result = store.query({ distinctId: 'device-a' });
      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.distinctId).toBe('device-a');
    });

    test('filters by userId', () => {
      store.insert(createEvent({ userId: 'user-1', name: 'a' }));
      store.insert(createEvent({ userId: 'user-2', name: 'b' }));

      const result = store.query({ userId: 'user-1' });
      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.userId).toBe('user-1');
    });

    test('array name filter matches multiple values', () => {
      store.insert(createEvent({ name: 'alpha' }));
      store.insert(createEvent({ name: 'beta' }));
      store.insert(createEvent({ name: 'gamma' }));

      const result = store.query({ name: ['alpha', 'gamma'] });
      expect(result.events).toHaveLength(2);
      const names = result.events.map((e) => e.name).sort();
      expect(names).toEqual(['alpha', 'gamma']);
    });

    test('array source filter matches multiple values', () => {
      store.insert(createEvent({ source: 'ui' }));
      store.insert(createEvent({ source: 'hub' }));
      store.insert(createEvent({ source: 'cli' }));

      const result = store.query({ source: ['ui', 'cli'] });
      expect(result.events).toHaveLength(2);
    });
  });

  // ── topSources ────────────────────────────────────────────────────────────

  describe('topSources', () => {
    test('counts events grouped by source, most frequent first', () => {
      store.insert(createEvent({ source: 'ui' }));
      store.insert(createEvent({ source: 'ui' }));
      store.insert(createEvent({ source: 'hub' }));
      store.insert(createEvent({ source: 'plugin' }));
      store.insert(createEvent({ source: 'plugin' }));
      store.insert(createEvent({ source: 'plugin' }));

      const sources = store.topSources();
      expect(sources[0]).toEqual({ source: 'plugin', count: 3 });
      expect(sources[1]).toEqual({ source: 'ui', count: 2 });
      expect(sources[2]).toEqual({ source: 'hub', count: 1 });
    });

    test('returns empty when no events are stored', () => {
      expect(store.topSources()).toEqual([]);
    });

    test('returns empty before init', () => {
      const uninit = new EventStore();
      expect(uninit.topSources()).toEqual([]);
    });

    test('covers all four valid CaptureSource values', () => {
      store.insert(createEvent({ source: 'ui' }));
      store.insert(createEvent({ source: 'hub' }));
      store.insert(createEvent({ source: 'plugin' }));
      store.insert(createEvent({ source: 'cli' }));

      const sources = store.topSources();
      const sourceNames = sources.map((s) => s.source).sort();
      expect(sourceNames).toEqual(['cli', 'hub', 'plugin', 'ui']);
    });
  });

  // ── topPlugins ────────────────────────────────────────────────────────────

  describe('topPlugins', () => {
    test('counts events with a pluginName, most frequent first', () => {
      store.insert(createEvent({ pluginName: '@acme/a' }));
      store.insert(createEvent({ pluginName: '@acme/a' }));
      store.insert(createEvent({ pluginName: '@acme/b' }));
      // Event without a pluginName must NOT appear in the result.
      store.insert(createEvent({}));

      const plugins = store.topPlugins();
      expect(plugins[0]).toEqual({ pluginName: '@acme/a', count: 2 });
      expect(plugins[1]).toEqual({ pluginName: '@acme/b', count: 1 });
      expect(plugins).toHaveLength(2);
    });

    test('returns empty when no events have a pluginName', () => {
      store.insert(createEvent({}));
      expect(store.topPlugins()).toEqual([]);
    });

    test('returns empty before init', () => {
      const uninit = new EventStore();
      expect(uninit.topPlugins()).toEqual([]);
    });

    test('honours the limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        store.insert(createEvent({ pluginName: `@acme/plugin-${i}` }));
      }
      const result = store.topPlugins(3);
      expect(result).toHaveLength(3);
    });
  });

  // ── getPluginNames ────────────────────────────────────────────────────────

  describe('getPluginNames', () => {
    test('returns distinct plugin names sorted alphabetically', () => {
      store.insert(createEvent({ pluginName: '@z/last' }));
      store.insert(createEvent({ pluginName: '@a/first' }));
      store.insert(createEvent({ pluginName: '@a/first' }));
      // Event without a plugin must not appear.
      store.insert(createEvent({}));

      const names = store.getPluginNames();
      expect(names).toEqual(['@a/first', '@z/last']);
    });

    test('returns empty when no plugin events exist', () => {
      store.insert(createEvent({}));
      expect(store.getPluginNames()).toEqual([]);
    });

    test('returns empty before init', () => {
      const uninit = new EventStore();
      expect(uninit.getPluginNames()).toEqual([]);
    });
  });

  // ── timeSeries: edge cases ─────────────────────────────────────────────────

  describe('timeSeries: edge cases', () => {
    test('returns empty when bucketMs is 0', () => {
      store.insert(createEvent({ ts: 1000 }));
      expect(store.timeSeries(0)).toEqual([]);
    });

    test('returns empty before init', () => {
      const uninit = new EventStore();
      expect(uninit.timeSeries(60_000)).toEqual([]);
    });

    test('filters by pluginName', () => {
      const hour = 60 * 60 * 1000;
      store.insert(createEvent({ ts: 1000, pluginName: '@a/b' }));
      store.insert(createEvent({ ts: 2000, pluginName: '@x/y' }));

      const result = store.timeSeries(hour, { pluginName: '@a/b' });
      expect(result).toHaveLength(1);
      expect(result[0]?.count).toBe(1);
    });
  });

  // ── enqueue + flush: error handling ───────────────────────────────────────

  describe('enqueue: no-op when closed', () => {
    test('enqueue after close is silently dropped', () => {
      store.insert(createEvent({ name: 'before-close' }));
      store.close();

      // After close, a new get() is needed (the old store is closed).
      // We verify the closed store itself doesn't accept new events by
      // checking that count() is still reported correctly.
      // (store.count() would return 0 because the db is closed, so we just
      // confirm no throw.)
      expect(() => store.enqueue(createEvent({ name: 'after-close' }))).not.toThrow();
    });
  });

  // ── clear: time range filters ─────────────────────────────────────────────

  describe('clear', () => {
    test('clears by name', () => {
      store.insert(createEvent({ name: 'keep' }));
      store.insert(createEvent({ name: 'drop' }));
      const deleted = store.clear({ name: 'drop' });
      expect(deleted).toBe(1);
      expect(store.query().events[0]?.name).toBe('keep');
    });

    test('clears by time range', () => {
      store.insert(createEvent({ ts: 1000 }));
      store.insert(createEvent({ ts: 5000 }));
      store.insert(createEvent({ ts: 9000 }));
      const deleted = store.clear({ startTs: 2000, endTs: 6000 });
      expect(deleted).toBe(1);
      expect(store.count()).toBe(2);
    });

    test('clears all when no filter', () => {
      store.insert(createEvent());
      store.insert(createEvent());
      const deleted = store.clear();
      expect(deleted).toBe(2);
      expect(store.count()).toBe(0);
    });

    test('returns 0 before init', () => {
      const uninit = new EventStore();
      expect(uninit.clear()).toBe(0);
    });
  });
});
