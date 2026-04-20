import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { configureDatabases } from '@brika/db';
import { bootstrapCLI, printDatabaseInfo } from '@/cli/bootstrap';
import type { BootstrapPlugin } from '@/runtime/bootstrap/plugin';

const TEST_DIR = join(import.meta.dir, '.test-cli-bootstrap');

beforeAll(() => rm(TEST_DIR, { recursive: true, force: true }));

beforeEach(() => {
  configureDatabases(TEST_DIR);
});

afterEach(async () => {
  await rm(join(TEST_DIR, 'db'), { recursive: true, force: true });
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe('bootstrapCLI', () => {
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

  test('calls setup/onInit/onStart on multiple plugins in phase order', async () => {
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
      onInit: async () => {
        order.push('onInit');
      },
      onStart: async () => {
        order.push('onStart');
      },
    };

    await bootstrapCLI(plugin);

    expect(order).toEqual(['onInit', 'onStart']);
  });
});

describe('printDatabaseInfo', () => {
  test('logs a line mentioning the auth database', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => lines.push(args.join(' '));
    try {
      printDatabaseInfo();
      expect(lines.join('\n')).toContain('auth.db');
    } finally {
      console.log = original;
    }
  });
});
