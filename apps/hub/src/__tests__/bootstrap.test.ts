/**
 * Tests for Bootstrap system
 */
import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { get, stub, useTestBed } from '@brika/di/testing';
import { Bootstrap, bootstrap } from '@/runtime/bootstrap/bootstrap';
import type { BrikaConfig } from '@/runtime/config';
import { BrikaInitializer, ConfigLoader } from '@/runtime/config';
import { Logger } from '@/runtime/logs/log-router';
import { LogStore } from '@/runtime/logs/log-store';

// autoStub: false because we want real Bootstrap with mocked dependencies
useTestBed({ autoStub: false });

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const mockConfig: BrikaConfig = {
  hub: {
    host: '0.0.0.0',
    port: 3001,
    plugins: { installDir: '/tmp', heartbeatInterval: 5000, heartbeatTimeout: 15000 },
  },
  plugins: [],
  rules: [],
  schedules: [],
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
    stub(BrikaInitializer);
    stub(ConfigLoader, { load: () => Promise.resolve(mockConfig) });
  });

  test('bootstrap() returns Bootstrap instance', () => {
    expect(bootstrap()).toBeInstanceOf(Bootstrap);
  });

  test('use() calls setup and supports chaining', () => {
    const b = get(Bootstrap);
    const setup1 = mock();
    const setup2 = mock();

    const result = b.use({ name: 'p1', setup: setup1 }).use({ name: 'p2', setup: setup2 });

    expect(result).toBe(b);
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

    b.use({ name: 'test', onLoad });
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

  test('start() skips on hot reload', async () => {
    const b = get(Bootstrap);
    const onInit = mock();

    setHotReload();
    b.use({ name: 'test', onInit });
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

  test('handles plugins without optional hooks', async () => {
    const b = get(Bootstrap);
    b.use({ name: 'minimal' });

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
