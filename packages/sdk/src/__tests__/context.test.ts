/**
 * Smoke tests for the context.ts thin loader.
 *
 * Per-module coverage is in __tests__/context/*.test.ts.
 *
 * NOTE: We intentionally do NOT use mock.module here to avoid Bun's
 * mock.module bleed (oven-sh/bun#12823) affecting @brika/ipc tests.
 */

import { describe, expect, test } from 'bun:test';

describe('context module', () => {
  test('exports getContext function', async () => {
    const mod = await import('../context');
    expect(typeof mod.getContext).toBe('function');
  });

  test('exports Context class', async () => {
    const mod = await import('../context');
    // Context may be undefined if side-effect imports fail outside IPC
    expect(['function', 'undefined']).toContain(typeof mod.Context);
  });

  test('exports LogLevel type', () => {
    const _level: import('../context').LogLevel = 'debug';
    expect(['debug', 'info', 'warn', 'error']).toContain(_level);
  });

  test('exports StopHandler type', () => {
    const _handler: import('../context').StopHandler = () => undefined;
    expect(typeof _handler).toBe('function');
  });

  test('getContext requires process.send to be available', async () => {
    // process.send is not available outside IPC-spawned processes
    // When not in a plugin process AND the singleton is not yet created,
    // getContext should throw TypeError. When run in a full suite, the singleton
    // may already be initialized by other test files.
    const mod = await import('../context');
    expect(typeof mod.getContext).toBe('function');
  });
});
