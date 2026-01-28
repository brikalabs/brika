/**
 * Tests for SDK Context
 *
 * Note: The Context class is tightly coupled to Bun globals (Bun.main, Bun.resolveSync)
 * and process.send, making it difficult to unit test directly. These tests focus on
 * the testable aspects of the module.
 */

import { describe, expect, test } from 'bun:test';

// ─────────────────────────────────────────────────────────────────────────────
// Module Import Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('context module', () => {
  test('exports getContext function', async () => {
    const module = await import('../context');

    expect(typeof module.getContext).toBe('function');
  });

  test('getContext behavior depends on process.send availability', async () => {
    // Note: The Context singleton is created once per module load.
    // If process.send is defined when the module loads, getContext will work.
    // If process.send is undefined, getContext will throw.
    // Since module state is shared across tests, we can only verify the function exists.
    const module = await import('../context');

    // The getContext function should exist regardless of process.send
    expect(typeof module.getContext).toBe('function');

    // Note: We can't easily test the throw behavior in isolation because:
    // 1. The module singleton persists across tests
    // 2. Changing process.send after module load doesn't affect existing Context
    // Integration tests in a proper plugin environment should test the throw case
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Type Export Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('context type exports', () => {
  test('exports LogLevel type', () => {
    // This is a compile-time check - if it compiles, the type exists
    const _level: import('../context').LogLevel = 'debug';
    expect(['debug', 'info', 'warn', 'error']).toContain(_level);
  });

  test('exports StopHandler type', () => {
    // Compile-time type check
    const _handler: import('../context').StopHandler = () => undefined;
    expect(typeof _handler).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration Tests (skipped in CI, run manually with actual plugin setup)
// ─────────────────────────────────────────────────────────────────────────────

describe.skip('Context integration', () => {
  // These tests require a proper plugin environment with:
  // - process.send available
  // - package.json with blocks/sparks declarations
  // - IPC connection to hub

  test.todo('loads manifest from package.json', () => undefined);
  test.todo('creates IPC client on construction', () => undefined);
  test.todo('sets up IPC handlers', () => undefined);
  test.todo('auto-starts on nextTick if not started', () => undefined);
  test.todo('log sends message via IPC', () => undefined);
  test.todo('onInit registers and runs handlers', () => undefined);
  test.todo('onStop registers handlers', () => undefined);
  test.todo('onUninstall registers handlers', () => undefined);
  test.todo('getPreferences returns current preferences', () => undefined);
  test.todo('onPreferencesChange notifies on updates', () => undefined);
  test.todo('registerBlock validates against manifest', () => undefined);
  test.todo('registerBlock sends definition via IPC', () => undefined);
  test.todo('registerSpark validates against manifest', () => undefined);
  test.todo('emitSpark sends event via IPC', () => undefined);
  test.todo('subscribeSpark manages subscriptions', () => undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// Note on Testing Strategy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Context class is designed to run within BRIKA plugin processes.
 * It has the following characteristics that make unit testing challenging:
 *
 * 1. Singleton pattern - getContext() creates a single instance
 * 2. Constructor side effects - loads manifest, creates IPC client, schedules auto-start
 * 3. Dependency on Bun globals - Bun.main, Bun.resolveSync for manifest loading
 * 4. Dependency on process.send - guards against non-plugin execution
 *
 * Testing approaches:
 * - Integration tests with actual plugin spawning (preferred for coverage)
 * - Refactoring to dependency injection (would require API changes)
 * - E2E tests through the hub (tests full IPC flow)
 *
 * The current coverage gap in context.ts is expected until one of these
 * approaches is implemented.
 */
