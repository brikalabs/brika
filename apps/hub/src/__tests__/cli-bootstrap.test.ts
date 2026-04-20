/**
 * Tests for apps/hub/src/cli/bootstrap.ts — bootstrapCLI and printDatabaseInfo.
 *
 * mock.module() is used here to intercept configureDatabases from @brika/db
 * without actually opening any database files.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { BootstrapPlugin } from '@/runtime/bootstrap/plugin';

// ─────────────────────────────────────────────────────────────────────────────
// Module mock — intercept @brika/db so configureDatabases is a no-op spy
// ─────────────────────────────────────────────────────────────────────────────

const mockConfigureDatabases = mock();

mock.module('@brika/db', () => ({
  configureDatabases: mockConfigureDatabases,
}));

// Dynamic import so the mock is in place when the module is evaluated.
const { bootstrapCLI, printDatabaseInfo } = await import('@/cli/bootstrap');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function captureConsoleLog(): { lines: string[]; restore(): void } {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => lines.push(args.join(' '));
  return { lines, restore: () => (console.log = original) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('bootstrapCLI', () => {
  beforeEach(() => {
    mockConfigureDatabases.mockClear();
  });

  afterEach(() => {
    mockConfigureDatabases.mockClear();
  });

  test('calls configureDatabases with dataDir', async () => {
    await bootstrapCLI();
    expect(mockConfigureDatabases).toHaveBeenCalledTimes(1);
    expect(typeof mockConfigureDatabases.mock.calls[0]?.[0]).toBe('string');
  });

  test('works with zero plugins', async () => {
    await expect(bootstrapCLI()).resolves.toBeDefined();
  });

  test('returns object with stop() method', async () => {
    const result = await bootstrapCLI();
    expect(typeof result.stop).toBe('function');
  });

  test('calls setup, onInit, and onStart on each plugin in order', async () => {
    const order: string[] = [];

    const plugin: BootstrapPlugin = {
      name: 'test-plugin',
      setup: () => {
        order.push('setup');
      },
      onInit: () => {
        order.push('onInit');
      },
      onStart: () => {
        order.push('onStart');
      },
    };

    await bootstrapCLI(plugin);

    expect(order).toEqual(['setup', 'onInit', 'onStart']);
  });

  test('calls setup/onInit/onStart on multiple plugins', async () => {
    const order: string[] = [];

    const p1: BootstrapPlugin = {
      name: 'p1',
      setup: () => {
        order.push('p1-setup');
      },
      onInit: () => {
        order.push('p1-init');
      },
      onStart: () => {
        order.push('p1-start');
      },
    };

    const p2: BootstrapPlugin = {
      name: 'p2',
      setup: () => {
        order.push('p2-setup');
      },
      onInit: () => {
        order.push('p2-init');
      },
      onStart: () => {
        order.push('p2-start');
      },
    };

    await bootstrapCLI(p1, p2);

    expect(order).toEqual(['p1-setup', 'p2-setup', 'p1-init', 'p2-init', 'p1-start', 'p2-start']);
  });

  test('stop() calls onStop on plugins in reverse order', async () => {
    const order: string[] = [];

    const p1: BootstrapPlugin = {
      name: 'p1',
      onStop: () => {
        order.push('p1');
      },
    };

    const p2: BootstrapPlugin = {
      name: 'p2',
      onStop: () => {
        order.push('p2');
      },
    };

    const { stop } = await bootstrapCLI(p1, p2);
    stop();

    expect(order).toEqual(['p2', 'p1']);
  });

  test('handles plugins where all optional methods are undefined', async () => {
    const minimal: BootstrapPlugin = { name: 'minimal' };
    const { stop } = await bootstrapCLI(minimal);
    expect(() => stop()).not.toThrow();
  });

  test('awaits async onInit and onStart hooks', async () => {
    const order: string[] = [];

    const plugin: BootstrapPlugin = {
      name: 'async-plugin',
      onInit: () => Promise.resolve(void order.push('onInit')),
      onStart: () => Promise.resolve(void order.push('onStart')),
    };

    await bootstrapCLI(plugin);

    expect(order).toEqual(['onInit', 'onStart']);
  });
});

describe('printDatabaseInfo', () => {
  test('logs a line mentioning the auth database', () => {
    const capture = captureConsoleLog();
    try {
      printDatabaseInfo();
      const output = capture.lines.join('\n');
      expect(output).toContain('auth.db');
    } finally {
      capture.restore();
    }
  });
});
