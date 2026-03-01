/**
 * Tests for Cache Bootstrap Plugin
 *
 * Uses DI stubs and a mock CacheClass instead of mock.module() to avoid
 * Bun bug #12823 (process-wide module mock bleed across test files).
 */

import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import type { SqliteCacheOptions } from '@brika/http';
import { HttpClient } from '@brika/http';
import {
  type CachePluginOptions,
  cache,
  getCacheInstance,
} from '@/runtime/bootstrap/plugins/cache';
import { Logger } from '@/runtime/logs/log-router';

// ─────────────────────────────────────────────────────────────────────────────
// Mock helpers
// ─────────────────────────────────────────────────────────────────────────────

const mockSetCache = mock();
const mockDestroy = mock();
const mockStats = mock().mockReturnValue({
  size: 10,
  tags: 2,
  dbSizeBytes: 4096,
});

let shouldThrow = false;

/** Fake SqliteCache class injected via CacheClass option. */
class FakeSqliteCache {
  constructor(_opts: SqliteCacheOptions) {
    if (shouldThrow) {
      throw new Error('SQLite open failed');
    }
  }
  destroy = mockDestroy;
  stats = mockStats;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test setup
// ─────────────────────────────────────────────────────────────────────────────

useTestBed({
  autoStub: false,
});

const mockLogInfo = mock();
const mockLogError = mock();
const mockLogWarn = mock();

describe('cache bootstrap plugin', () => {
  beforeEach(() => {
    shouldThrow = false;
    mockSetCache.mockClear();
    mockDestroy.mockClear();
    mockStats.mockClear();
    mockStats.mockReturnValue({
      size: 10,
      tags: 2,
      dbSizeBytes: 4096,
    });
    mockLogInfo.mockClear();
    mockLogError.mockClear();
    mockLogWarn.mockClear();
    stub(Logger, {
      info: mockLogInfo,
      error: mockLogError,
      warn: mockLogWarn,
    });
    stub(HttpClient, {
      setCache: mockSetCache,
    } as Partial<HttpClient>);
  });

  /** Helper: create the plugin with the fake cache class. */
  function createPlugin() {
    return cache({
      CacheClass: FakeSqliteCache as unknown as CachePluginOptions['CacheClass'],
    });
  }

  // ── Factory ──────────────────────────────────────────────────────────────

  test('cache() returns a plugin with name "cache"', () => {
    const plugin = createPlugin();
    expect(plugin.name).toBe('cache');
  });

  test('cache() returns a plugin with onInit and onStop hooks', () => {
    const plugin = createPlugin();
    expect(typeof plugin.onInit).toBe('function');
    expect(typeof plugin.onStop).toBe('function');
  });

  // ── onInit: success path ─────────────────────────────────────────────────

  test('onInit() creates SqliteCache and sets it on HttpClient', async () => {
    const plugin = createPlugin();
    await plugin.onInit?.();

    expect(mockSetCache).toHaveBeenCalledTimes(1);
  });

  test('onInit() calls stats() on the new cache instance', async () => {
    const plugin = createPlugin();
    await plugin.onInit?.();

    expect(mockStats).toHaveBeenCalledTimes(1);
  });

  test('onInit() logs initialization info', async () => {
    const plugin = createPlugin();
    await plugin.onInit?.();

    expect(mockLogInfo).toHaveBeenCalledTimes(2);

    const [firstMsg] = mockLogInfo.mock.calls[0];
    expect(firstMsg).toBe('Initializing SQLite cache');

    const [secondMsg, secondMeta] = mockLogInfo.mock.calls[1];
    expect(secondMsg).toBe('SQLite cache initialized');
    expect(secondMeta).toMatchObject({
      entries: 10,
      tags: 2,
      dbSizeBytes: 4096,
    });
  });

  // ── onInit: error path ───────────────────────────────────────────────────

  test('onInit() catches SqliteCache constructor errors and logs error', async () => {
    shouldThrow = true;
    const plugin = createPlugin();
    await plugin.onInit?.();

    expect(mockLogError).toHaveBeenCalledTimes(1);
    const [msg, meta] = mockLogError.mock.calls[0];
    expect(msg).toContain('Failed to initialize SQLite cache');
    expect(meta).toMatchObject({
      error: expect.stringContaining('SQLite open failed'),
    });
  });

  test('onInit() does not call setCache when constructor throws', async () => {
    shouldThrow = true;
    const plugin = createPlugin();
    await plugin.onInit?.();

    expect(mockSetCache).not.toHaveBeenCalled();
  });

  // ── onStop ───────────────────────────────────────────────────────────────

  test('onStop() destroys cache instance after successful init', async () => {
    const plugin = createPlugin();
    await plugin.onInit?.();
    plugin.onStop?.();

    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  test('onStop() logs closing message when cache exists', async () => {
    const plugin = createPlugin();
    await plugin.onInit?.();

    // Clear the init logs so we can assert only the stop log
    mockLogInfo.mockClear();

    plugin.onStop?.();

    expect(mockLogInfo).toHaveBeenCalledTimes(1);
    const [msg] = mockLogInfo.mock.calls[0];
    expect(msg).toBe('Closing SQLite cache');
  });

  test('onStop() sets cacheInstance to null after destroy', async () => {
    const plugin = createPlugin();
    await plugin.onInit?.();
    expect(getCacheInstance()).not.toBeNull();

    plugin.onStop?.();
    expect(getCacheInstance()).toBeNull();
  });

  test('onStop() does nothing when no cache instance exists', () => {
    // Ensure no cache instance from a prior test
    const plugin = createPlugin();
    // Call onStop without onInit — should not throw or call destroy
    plugin.onStop?.();

    expect(mockDestroy).not.toHaveBeenCalled();
  });

  // ── getCacheInstance ─────────────────────────────────────────────────────

  test('getCacheInstance() returns null initially', () => {
    // Before any init, the module-level variable should be null
    // (relies on onStop having been called by a prior test, or fresh module state)
    expect(getCacheInstance()).toBeNull();
  });

  test('getCacheInstance() returns the instance after successful init', async () => {
    const plugin = createPlugin();
    await plugin.onInit?.();

    const instance = getCacheInstance();
    expect(instance).not.toBeNull();
    expect(typeof instance?.destroy).toBe('function');
    expect(typeof instance?.stats).toBe('function');

    // Cleanup
    plugin.onStop?.();
  });

  test('getCacheInstance() returns null after onStop()', async () => {
    const plugin = createPlugin();
    await plugin.onInit?.();
    plugin.onStop?.();

    expect(getCacheInstance()).toBeNull();
  });
});
