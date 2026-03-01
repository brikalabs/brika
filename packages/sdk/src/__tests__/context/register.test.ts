/**
 * Tests for the Context Module Registration System.
 *
 * Tests registerContextModule() and initAllModules() from register.ts.
 *
 * Because registerContextModule pushes to a module-level array that is shared
 * across all test files (Bun shares modules), we avoid asserting on
 * registration count. Instead, we test initAllModules directly by providing
 * a mock ContextCore and verifying that methods are applied to the target
 * and stop functions are collected.
 */

import { describe, expect, mock, test } from 'bun:test';
import { initAllModules, registerContextModule, type SetupFn } from '../../context/register';
import { createTestHarness } from './_test-utils';

// ─── Mock Infrastructure ─────────────────────────────────────────────────────

const h = createTestHarness();

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('registerContextModule and initAllModules', () => {
  test('initAllModules applies methods from modules to target object', () => {
    // Register a test module that provides methods
    const greetFn = () => 'hello';
    const setup: SetupFn = () => ({
      methods: {
        greet: greetFn,
      },
    });
    registerContextModule('test-greet', setup);

    const core = h.core;
    const target: Record<string, unknown> = {};

    initAllModules(core, target);

    // The greet method should now be on the target
    expect(typeof target.greet).toBe('function');
    expect((target.greet as () => string)()).toBe('hello');
  });

  test('initAllModules collects stop functions', () => {
    const stopFn = mock(() => {
      /* noop */
    });
    const setup: SetupFn = () => ({
      stop: stopFn,
    });
    registerContextModule('test-stop', setup);

    const core = h.core;
    const target: Record<string, unknown> = {};

    const stopFns = initAllModules(core, target);

    // At least one stop function should be collected (from our module)
    expect(stopFns.length).toBeGreaterThan(0);

    // The last stop function should be ours
    const lastStop = stopFns[stopFns.length - 1] ?? (() => {});
    lastStop();
    expect(stopFn).toHaveBeenCalledTimes(1);
  });

  test('module without methods or stop is handled gracefully', () => {
    const setup: SetupFn = () => ({});
    registerContextModule('test-empty', setup);

    const core = h.core;
    const target: Record<string, unknown> = {};

    // Should not throw
    expect(() => initAllModules(core, target)).not.toThrow();
  });

  test('methods are callable on the target', () => {
    const addFn = mock((a: number, b: number) => a + b);
    const setup: SetupFn = () => ({
      methods: {
        add: addFn,
      },
    });
    registerContextModule('test-add', setup);

    const core = h.core;
    const target: Record<string, unknown> = {};

    initAllModules(core, target);

    expect(typeof target.add).toBe('function');

    const result = (target.add as (a: number, b: number) => number)(3, 7);
    expect(result).toBe(10);
    expect(addFn).toHaveBeenCalledWith(3, 7);
  });
});
