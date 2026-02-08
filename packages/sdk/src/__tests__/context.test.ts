/**
 * Smoke tests for the context.ts thin loader.
 *
 * Per-module coverage is in __tests__/context/*.test.ts.
 */

import { describe, expect, test } from 'bun:test';

describe('context module', () => {
  test('exports getContext function', async () => {
    const mod = await import('../context');
    expect(typeof mod.getContext).toBe('function');
  });

  test('exports LogLevel type', () => {
    const _level: import('../context').LogLevel = 'debug';
    expect(['debug', 'info', 'warn', 'error']).toContain(_level);
  });

  test('exports StopHandler type', () => {
    const _handler: import('../context').StopHandler = () => undefined;
    expect(typeof _handler).toBe('function');
  });
});
