/**
 * Tests for Bootstrap system
 */
import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { EventForwarder, EventStore } from '@brika/analytics';
import { get, stub, useTestBed } from '@brika/di/testing';
import { Bootstrap, bootstrap } from '@/runtime/bootstrap/bootstrap';
import type { BrikaConfig } from '@/runtime/config';
import { BrikaInitializer, ConfigLoader } from '@/runtime/config';
import { ApiServer } from '@/runtime/http/api-server';
import { Logger } from '@/runtime/logs/log-router';
import { LogStore } from '@/runtime/logs/log-store';

// autoStub: false because we want real Bootstrap with mocked dependencies
useTestBed({
  autoStub: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const mockConfig: BrikaConfig = {
  hub: {
    host: '0.0.0.0',
    port: 3001,
    corsAllowlist: [],
    plugins: {
      installDir: '/tmp',
      heartbeatInterval: 5000,
      heartbeatTimeout: 15000,
      rssSoftLimitBytes: 0,
      idleReapMs: 0,
      keepWarmCount: 0,
      bytecode: false,
    },
    logs: { retentionDays: 7, pruneIntervalMs: 3600000 },
    analytics: { retentionDays: 90, pruneIntervalMs: 3600000 },
    shutdown: { gracePeriodMs: 10000 },
  },
  plugins: [],
  rules: [],
  schedules: [],
  npmRegistries: {},
  searchStores: [],
  registries: [],
};

const clearHotReload = () => {
  (globalThis as Record<symbol, boolean>)[Symbol.for('brika.hub.started')] = false;
};

const setHotReload = () => {
  (globalThis as Record<symbol, boolean>)[Symbol.for('brika.hub.started')] = true;
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Bootstrap', () => {
  beforeEach(() => {
    clearHotReload();
    stub(Logger);
    stub(LogStore);
    stub(EventStore);
    stub(EventForwarder);
    stub(ApiServer);
    stub(BrikaInitializer);
    stub(ConfigLoader, {
      getRootDir: () => '/tmp/bootstrap-test',
      load: () => Promise.resolve(mockConfig),
    });
  });

  test('bootstrap() returns Bootstrap instance', () => {
    expect(bootstrap()).toBeInstanceOf(Bootstrap);
  });

  test('use() calls setup and supports chaining', async () => {
    const b = get(Bootstrap);
    const setup1 = mock();
    const setup2 = mock();

    const result = b.use({ name: 'p1', setup: setup1 }).use({ name: 'p2', setup: setup2 });

    expect(result).toBe(b);
    // setup is deferred to start() so configureDatabases() runs first
    expect(setup1).not.toHaveBeenCalled();
    expect(setup2).not.toHaveBeenCalled();

    await b.start();

    expect(setup1).toHaveBeenCalledWith(b);
    expect(setup2).toHaveBeenCalledWith(b);
  });

  test('start() runs plugin lifecycle: init → load → start', async () => {
    const b = get(Bootstrap);
    const order: string[] = [];

    b.use({
      name: 'test',
      onInit: () => {
        order.push('init');
      },
      onLoad: () => {
        order.push('load');
      },
      onStart: () => {
        order.push('start');
      },
    });

    await b.start();

    expect(order).toEqual(['init', 'load', 'start']);
  });

  test('start() passes config to onLoad', async () => {
    const b = get(Bootstrap);
    const onLoad = mock();

    b.use({
      name: 'test',
      onLoad,
    });
    await b.start();

    expect(onLoad).toHaveBeenCalledWith(mockConfig);
  });

  test('start() runs all plugins in phases (all inits, then all loads, then all starts)', async () => {
    const b = get(Bootstrap);
    const order: string[] = [];

    b.use({
      name: 'p1',
      onInit: () => {
        order.push('p1-init');
      },
      onLoad: () => {
        order.push('p1-load');
      },
      onStart: () => {
        order.push('p1-start');
      },
    }).use({
      name: 'p2',
      onInit: () => {
        order.push('p2-init');
      },
      onLoad: () => {
        order.push('p2-load');
      },
      onStart: () => {
        order.push('p2-start');
      },
    });

    await b.start();

    expect(order).toEqual(['p1-init', 'p2-init', 'p1-load', 'p2-load', 'p1-start', 'p2-start']);
  });

  test('a non-fatal plugin failure is logged and the boot continues', async () => {
    const b = get(Bootstrap);
    const after = mock();

    b.use({
      name: 'boom',
      onStart: () => {
        throw new Error('bind failed');
      },
    }).use({ name: 'after', onStart: after });

    await b.start();

    expect(after).toHaveBeenCalled();
  });

  test('a fatal plugin failure aborts the boot', async () => {
    const b = get(Bootstrap);
    const after = mock();

    b.use({
      name: 'api-server',
      fatal: true,
      onStart: () => {
        throw new Error('port 3001 in use');
      },
    }).use({ name: 'after', onStart: after });

    await expect(b.start()).rejects.toThrow('port 3001 in use');
    expect(after).not.toHaveBeenCalled();
  });

  test('start() skips on hot reload', async () => {
    const b = get(Bootstrap);
    const onInit = mock();

    setHotReload();
    b.use({
      name: 'test',
      onInit,
    });
    await b.start();

    expect(onInit).not.toHaveBeenCalled();
  });

  test('stop() calls plugins in reverse order', async () => {
    const b = get(Bootstrap);
    const order: string[] = [];

    b.use({
      name: 'p1',
      onStop: () => {
        order.push('p1');
      },
    }).use({
      name: 'p2',
      onStop: () => {
        order.push('p2');
      },
    });

    await b.stop();

    expect(order).toEqual(['p2', 'p1']);
  });

  describe('shutdown', () => {
    test('drains cleanly within the grace period and flushes logs', async () => {
      const close = mock();
      stub(LogStore, { close });
      const forceStop = mock(() => Promise.resolve());
      stub(ApiServer, { stop: forceStop });

      const b = get(Bootstrap);
      const stopped = mock(() => Promise.resolve());
      b.use({ name: 'fast', onStop: stopped });

      const result = await b.shutdown(1000);

      expect(result).toBe('drained');
      expect(stopped).toHaveBeenCalled();
      // No hard force-close needed on the clean path.
      expect(forceStop).not.toHaveBeenCalledWith(true);
      // Logs flushed before exit.
      expect(close).toHaveBeenCalled();
    });

    test('forces exit on timeout, force-closes the server, still flushes logs', async () => {
      const close = mock();
      stub(LogStore, { close });
      const forceStop = mock(() => Promise.resolve());
      stub(ApiServer, { stop: forceStop });

      const b = get(Bootstrap);
      // A wedged onStop that never resolves must not hang shutdown forever.
      b.use({ name: 'wedged', onStop: () => new Promise<void>(() => {}) });

      const result = await b.shutdown(20);

      expect(result).toBe('timeout');
      // Hard-timeout fallback force-closes lingering connections.
      expect(forceStop).toHaveBeenCalledWith(true);
      // Log buffer is flushed even when stop() never completed.
      expect(close).toHaveBeenCalled();
    });
  });

  test('handles plugins without optional hooks', async () => {
    const b = get(Bootstrap);
    b.use({
      name: 'minimal',
    });

    // Should not throw
    await b.start();
    await b.stop();
  });

  test('onInit/onLoad/onStart can be sync or async', async () => {
    const b = get(Bootstrap);
    let syncCalled = false;
    let asyncCalled = false;

    b.use({
      name: 'sync',
      onInit: () => {
        syncCalled = true;
      },
    }).use({
      name: 'async',
      onInit: () =>
        Promise.resolve().then(() => {
          asyncCalled = true;
        }),
    });

    await b.start();

    expect(syncCalled).toBe(true);
    expect(asyncCalled).toBe(true);
  });
});
