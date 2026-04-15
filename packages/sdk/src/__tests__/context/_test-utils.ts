/**
 * Shared test utilities for context module tests.
 *
 * Provides a mock prelude bridge and ContextCore factory.
 * All modules delegate to the bridge; the test harness installs
 * a mock bridge on globalThis.__brika_ipc.
 */

import { mock } from 'bun:test';
import { PRELUDE_BRAND, type PreludeBridge } from '../../bridge';
import type { ContextCore, Manifest } from '../../context/register';

// ─── Types ───────────────────────────────────────────────────────────────────

export type Handler = (...args: unknown[]) => unknown;

// ─── Noop Mock ───────────────────────────────────────────────────────────────

/** Create a fresh mock function with a noop body (biome-safe). */
export const noopMock = (): ReturnType<typeof mock<(...args: unknown[]) => unknown>> =>
  mock(() => {
    /* noop */
  });

// ─── Test Harness ────────────────────────────────────────────────────────────

export interface TestHarness {
  /** The ContextCore to pass to setup functions. */
  core: ContextCore;
  /** The mock bridge installed on globalThis.__brika_ipc. */
  bridge: MockBridge;
  /** Log messages captured from core.log(). */
  logMessages: Array<{ level: string; message: string }>;

  /** Clear all mocks and captured state. */
  reset(): void;
}

// ─── Mock Bridge ─────────────────────────────────────────────────────────────

export interface MockBridge {
  readonly [PRELUDE_BRAND]: true;

  // System
  start: ReturnType<typeof mock>;
  onStop: ReturnType<typeof mock>;
  log: ReturnType<typeof mock>;

  // Manifest
  getManifest: ReturnType<typeof mock>;
  getPluginRootDirectory: ReturnType<typeof mock>;
  getPluginUid: ReturnType<typeof mock>;

  // Lifecycle
  onInit: ReturnType<typeof mock>;
  onUninstall: ReturnType<typeof mock>;
  getPreferences: ReturnType<typeof mock>;
  onPreferencesChange: ReturnType<typeof mock>;
  updatePreference: ReturnType<typeof mock>;
  definePreferenceOptions: ReturnType<typeof mock>;

  // Actions
  registerAction: ReturnType<typeof mock>;

  // Routes
  registerRoute: ReturnType<typeof mock>;

  // Blocks
  registerBlock: ReturnType<typeof mock>;

  // Sparks
  registerSpark: ReturnType<typeof mock>;
  emitSpark: ReturnType<typeof mock>;
  subscribeSpark: ReturnType<typeof mock>;

  // Bricks
  registerBrickType: ReturnType<typeof mock>;
  setBrickData: ReturnType<typeof mock>;
  onBrickConfigChange: ReturnType<typeof mock>;

  // Location
  getLocation: ReturnType<typeof mock>;
  getTimezone: ReturnType<typeof mock>;
}

function createMockBridge(manifest: Partial<Manifest>): MockBridge {
  const fullManifest = { name: 'test-plugin', version: '1.0.0', ...manifest };
  return {
    [PRELUDE_BRAND]: true as const,

    // System
    start: noopMock(),
    onStop: mock((_fn: unknown) => () => {
      /* noop */
    }),
    log: noopMock(),

    // Manifest
    getManifest: mock(() => fullManifest),
    getPluginRootDirectory: mock(() => '/test/plugin'),
    getPluginUid: mock(() => undefined),

    // Lifecycle
    onInit: mock((_fn: unknown) => () => {
      /* noop */
    }),
    onUninstall: mock((_fn: unknown) => () => {
      /* noop */
    }),
    getPreferences: mock(() => ({})),
    onPreferencesChange: mock((_handler: unknown) => () => {
      /* noop */
    }),
    updatePreference: noopMock(),
    definePreferenceOptions: noopMock(),

    // Actions
    registerAction: noopMock(),

    // Routes
    registerRoute: noopMock(),

    // Blocks
    registerBlock: mock((_block: unknown) => ({ id: 'test-block' })),

    // Sparks
    registerSpark: noopMock(),
    emitSpark: noopMock(),
    subscribeSpark: mock((_type: unknown, _handler: unknown) => () => {
      /* noop */
    }),

    // Bricks
    registerBrickType: noopMock(),
    setBrickData: noopMock(),
    onBrickConfigChange: mock((_handler: unknown) => () => {
      /* noop */
    }),

    // Location
    getLocation: mock(async () => null),
    getTimezone: mock(async () => null),
  };
}

/**
 * Create a complete test harness for a context module.
 *
 * Installs a mock bridge on globalThis.__brika_ipc and provides a
 * ContextCore for module setup functions.
 */
export function createTestHarness(manifest?: Partial<Manifest>): TestHarness {
  const logMessages: Array<{ level: string; message: string }> = [];
  const bridge = createMockBridge(manifest ?? {});

  // Install on global
  globalThis.__brika_ipc = bridge as unknown as PreludeBridge;

  const core: ContextCore = {
    manifest: {
      name: 'test-plugin',
      version: '1.0.0',
      ...manifest,
    },
    log: mock((level: string, message: string) => {
      logMessages.push({ level, message });
    }) as unknown as ContextCore['log'],
  };

  function reset() {
    // Clear all bridge mocks in-place (keep same object reference)
    for (const value of Object.values(bridge)) {
      if (typeof value === 'function' && 'mockClear' in value) {
        (value as ReturnType<typeof mock>).mockClear();
      }
    }
    // Re-install defaults for mocks that return values
    bridge.getManifest.mockImplementation(() => core.manifest);
    bridge.getPluginRootDirectory.mockImplementation(() => '/test/plugin');
    bridge.getPluginUid.mockImplementation(() => undefined);
    bridge.onInit.mockImplementation((_fn: unknown) => () => {
      /* noop */
    });
    bridge.onUninstall.mockImplementation((_fn: unknown) => () => {
      /* noop */
    });
    bridge.onStop.mockImplementation((_fn: unknown) => () => {
      /* noop */
    });
    bridge.getPreferences.mockImplementation(() => ({}));
    bridge.onPreferencesChange.mockImplementation((_handler: unknown) => () => {
      /* noop */
    });
    bridge.subscribeSpark.mockImplementation((_type: unknown, _handler: unknown) => () => {
      /* noop */
    });
    bridge.registerBlock.mockImplementation((_block: unknown) => ({ id: 'test-block' }));
    bridge.onBrickConfigChange.mockImplementation((_handler: unknown) => () => {
      /* noop */
    });
    bridge.getLocation.mockImplementation(async () => null);
    bridge.getTimezone.mockImplementation(async () => null);

    globalThis.__brika_ipc = bridge as unknown as PreludeBridge;
    logMessages.length = 0;
    (core.log as ReturnType<typeof mock>).mockClear();
  }

  return {
    core,
    bridge,
    logMessages,
    reset,
  };
}
