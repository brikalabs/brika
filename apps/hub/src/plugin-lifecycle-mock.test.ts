/**
 * Tests for PluginLifecycle internal callbacks (mock.module-based)
 *
 * Mocks @/runtime/plugins/lifecycle-deps (re-export layer) instead of
 * @brika/compiler, @brika/ipc, or @/runtime/plugins/plugin-process
 * directly, preventing Bun's mock.module() bleed (oven-sh/bun#12823).
 */

import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { get, provide, stub, useTestBed } from '@brika/di/testing';
import { sleep, waitFor } from '@brika/testing';
import { PluginManagerConfig } from '@/runtime/config';
import { brikaContext } from '@/runtime/context/brika-context';
import { EventSystem } from '@/runtime/events/event-system';
import { I18nService } from '@/runtime/i18n';
import { Logger } from '@/runtime/logs/log-router';
import { MetricsStore } from '@/runtime/metrics';
import { ModuleCompiler } from '@/runtime/modules';
import { PluginConfigService } from '@/runtime/plugins/plugin-config';
import { PluginEventHandler } from '@/runtime/plugins/plugin-events';
import type { PluginProcess, PluginProcessCallbacks } from '@/runtime/plugins/plugin-process';
import { PluginResolver } from '@/runtime/plugins/plugin-resolver';
import { SecretStore } from '@/runtime/secrets/secret-store';
import { StateStore } from '@/runtime/state/state-store';
import { type BunSecretsMock, installBunSecretsMock } from './_bun-secrets-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Capture variables for mock.module callbacks
// ─────────────────────────────────────────────────────────────────────────────

let capturedCallbacks: PluginProcessCallbacks | null = null;
let capturedSpawnDisconnect: ((error?: Error) => void) | null = null;
let capturedSpawnStderr: ((line: string) => void) | null = null;
let mockProcessInstance: Record<string, unknown> | null = null;

// Mock the lifecycle-deps re-export layer (never mock the originals directly)
mock.module('@/runtime/plugins/lifecycle-deps', () => ({
  compileServerEntry: mock().mockResolvedValue({
    success: true,
    entryPath: '/mock/path/node_modules/.cache/brika-server/index.js',
  }),
  spawnPlugin: mock((_cmd: string, _args: string[], opts?: Record<string, unknown>) => {
    capturedSpawnDisconnect = (opts?.onDisconnect as (error?: Error) => void) ?? null;
    capturedSpawnStderr = (opts?.onStderr as (line: string) => void) ?? null;
    return {
      pid: 99999,
      on: mock(),
      send: mock(),
      call: mock(),
      implement: mock(),
      stop: mock(),
      kill: mock(),
      exited: Promise.resolve(0),
      ping: mock().mockResolvedValue(1),
    };
  }),
  PluginProcess: class MockPluginProcess {
    name: string;
    uid: string;
    version: string;
    pid = 99999;
    startedAt = Date.now();
    metadata: unknown;
    rootDirectory: string;
    entryPoint: string;
    locales: string[];
    blocks = new Set<string>();
    sparks = new Set<string>();
    brickTypes = new Set<string>();

    constructor(
      _channel: unknown,
      info: {
        name: string;
        uid: string;
        version: string;
        metadata: unknown;
        rootDirectory: string;
        entryPoint: string;
        locales: string[];
      },
      _config: unknown,
      callbacks: PluginProcessCallbacks
    ) {
      this.name = info.name;
      this.uid = info.uid;
      this.version = info.version;
      this.metadata = info.metadata;
      this.rootDirectory = info.rootDirectory;
      this.entryPoint = info.entryPoint;
      this.locales = info.locales;
      capturedCallbacks = callbacks;
      mockProcessInstance = this as unknown as Record<string, unknown>;
    }

    stop = mock();
    kill = mock();
    exited = Promise.resolve(0);
    sendPreferences = mock();
    sendSparkEvent = mock();
    toPlugin = mock().mockReturnValue({
      uid: 'test-uid',
      name: '@test/plugin',
      version: '1.0.0',
      status: 'running',
    });
  },
}));

// Import after mocks are set up (only @brika/ipc and plugin-process are mocked via mock.module)
const { PluginLifecycle: PluginLifecycleMocked } = await import(
  '@/runtime/plugins/plugin-lifecycle'
);

// Default mock resolver response
const defaultResolverResult = {
  rootDirectory: '/mock/path',
  entryPoint: '/mock/path/index.js',
  metadata: {
    name: '@test/plugin',
    version: '1.0.0',
    main: 'index.js',
    engines: {
      brika: '*',
    },
    blocks: [
      {
        id: 'test-block',
      },
    ],
    sparks: [
      {
        id: 'test-spark',
      },
    ],
    bricks: [
      {
        id: 'test-brick',
      },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('PluginLifecycle (with mocked spawn)', () => {
  let lifecycle: InstanceType<typeof PluginLifecycleMocked>;
  let mockConfig: Record<string, unknown>;
  let mockState: Record<string, ReturnType<typeof mock>>;
  let mockEvents: Record<string, ReturnType<typeof mock>>;
  let mockEventHandler: Record<string, ReturnType<typeof mock>>;
  let mockPluginConfig: Record<string, ReturnType<typeof mock>>;
  let mockMetrics: Record<string, ReturnType<typeof mock>>;
  let secretsMock: BunSecretsMock;
  let resolverSpy: ReturnType<typeof spyOn>;

  useTestBed({
    autoStub: false,
  });

  beforeEach(() => {
    // Mock PluginResolver.resolve via prototype spyOn (avoids mock.module bleed)
    resolverSpy = spyOn(PluginResolver.prototype, 'resolve').mockResolvedValue(
      defaultResolverResult as never
    );
    capturedCallbacks = null;
    capturedSpawnDisconnect = null;
    capturedSpawnStderr = null;
    mockProcessInstance = null;

    mockConfig = {
      restartBaseDelayMs: 1000,
      restartMaxDelayMs: 30000,
      restartMaxCrashes: 5,
      restartCrashWindowMs: 60000,
      restartStabilityMs: 30000,
      callTimeoutMs: 5000,
      heartbeatEveryMs: 60000,
      heartbeatTimeoutMs: 5000,
      autoRestartEnabled: true,
      killTimeoutMs: 0,
    };
    mockState = {
      get: mock(),
      getByUid: mock(),
      getWithMetadata: mock(),
      getByUidWithMetadata: mock(),
      listInstalled: mock().mockReturnValue([]),
      listInstalledWithMetadata: mock().mockReturnValue([]),
      registerPlugin: mock().mockResolvedValue(undefined),
      remove: mock().mockResolvedValue(undefined),
      setHealth: mock().mockResolvedValue(undefined),
      loadMetadataCache: mock().mockResolvedValue(undefined),
    };
    mockEvents = {
      dispatch: mock().mockResolvedValue(undefined),
      subscribe: mock().mockReturnValue(() => undefined),
    };
    mockEventHandler = {
      onPluginReady: mock(),
      onPluginLog: mock(),
      registerBlock: mock(),
      onBlockEmit: mock(),
      onBlockLog: mock(),
      registerSpark: mock(),
      emitSpark: mock(),
      subscribeToSparks: mock().mockReturnValue(() => undefined),
      registerBrickType: mock(),
      registerRoute: mock(),
      onPluginDisconnected: mock(),
      onRssSoftLimitBreached: mock(),
    };
    mockPluginConfig = {
      getConfig: mock().mockResolvedValue({}),
      validate: mock().mockReturnValue({
        success: true,
      }),
      setConfig: mock().mockResolvedValue(undefined),
    };
    mockMetrics = {
      record: mock(),
      clear: mock(),
    };

    stub(Logger);
    stub(ModuleCompiler);
    provide(PluginManagerConfig, mockConfig);
    provide(StateStore, mockState);
    provide(EventSystem, mockEvents);
    provide(I18nService, {
      registerPluginTranslations: mock().mockResolvedValue([]),
    });
    provide(PluginEventHandler, mockEventHandler);
    provide(PluginConfigService, mockPluginConfig);
    provide(MetricsStore, mockMetrics);

    secretsMock = installBunSecretsMock();
    provide(SecretStore, new SecretStore());

    lifecycle = get(PluginLifecycleMocked);
  });

  afterEach(() => {
    secretsMock.restore();
    resolverSpy.mockRestore();
  });

  async function loadPlugin() {
    await lifecycle.load('/mock/path');
    expect(capturedCallbacks).not.toBeNull();
    if (!capturedCallbacks) {
      throw new Error('Expected capturedCallbacks to be defined');
    }
    return capturedCallbacks;
  }

  describe('load() and callbacks', () => {
    test('load() registers plugin in state store', async () => {
      await loadPlugin();

      expect(mockState.registerPlugin).toHaveBeenCalled();
      expect(mockState.setHealth).toHaveBeenCalledWith('@test/plugin', 'restarting');
    });

    test('load() skips if process already exists and force is false', async () => {
      await loadPlugin();
      mockState.registerPlugin.mockClear();

      await lifecycle.load('/mock/path');
      expect(mockState.registerPlugin).not.toHaveBeenCalled();
    });

    test('getProcessByUid returns process by uid after load', async () => {
      await loadPlugin();

      const process = lifecycle.getProcess('@test/plugin');
      if (!process) {
        throw new Error('expected process to be defined after load');
      }

      const found = lifecycle.getProcessByUid(process.uid);
      expect(found).toBe(process);
    });

    test('getProcessByUid returns undefined after unload', async () => {
      await loadPlugin();

      const process = lifecycle.getProcess('@test/plugin');
      if (!process) {
        throw new Error('expected process to be defined after load');
      }
      const uid = process.uid;
      await lifecycle.unload('@test/plugin');

      expect(lifecycle.getProcessByUid(uid)).toBeUndefined();
    });

    test('onReady callback sends preferences when validation succeeds', async () => {
      const callbacks = await loadPlugin();
      const process = mockProcessInstance as unknown as PluginProcess;

      await callbacks.onReady(process);

      expect(mockPluginConfig.getConfig).toHaveBeenCalledWith('@test/plugin');
      expect(mockPluginConfig.validate).toHaveBeenCalled();
      expect(mockEventHandler.onPluginReady).toHaveBeenCalledWith(process);
    });

    test('onReady callback unloads plugin when config validation fails', async () => {
      mockPluginConfig.validate.mockReturnValue({
        success: false,
        error: {
          issues: [
            {
              path: ['key'],
              message: 'required',
            },
          ],
        },
      });

      const callbacks = await loadPlugin();
      const process = mockProcessInstance as unknown as PluginProcess;

      await callbacks.onReady(process);

      expect(mockEvents.dispatch).toHaveBeenCalled();
      expect(mockEventHandler.onPluginReady).not.toHaveBeenCalled();
    });

    test('onReady parks the plugin in awaiting-config on validation failure', async () => {
      // Specifically asserts that the lifecycle promotes the failure
      // to a first-class state instead of treating it as a crash.
      mockPluginConfig.validate.mockReturnValue({
        success: false,
        error: {
          issues: [{ path: ['apiKey'], message: 'required' }],
        },
      });

      const callbacks = await loadPlugin();
      const process = mockProcessInstance as unknown as PluginProcess;

      await callbacks.onReady(process);

      const setHealthCalls = mockState.setHealth.mock.calls;
      const awaiting = setHealthCalls.find(
        (args) => args[0] === '@test/plugin' && args[1] === 'awaiting-config'
      );
      expect(awaiting).toBeDefined();
    });

    test('onLog callback delegates to event handler', async () => {
      const callbacks = await loadPlugin();
      callbacks.onLog('info', 'test message', {
        extra: 'data',
      });
      expect(mockEventHandler.onPluginLog).toHaveBeenCalledWith(
        '@test/plugin',
        'info',
        'test message',
        {
          extra: 'data',
        }
      );
    });

    test('onBlock callback delegates to event handler', async () => {
      const callbacks = await loadPlugin();
      callbacks.onBlock({
        id: 'test-block',
      });
      expect(mockEventHandler.registerBlock).toHaveBeenCalledWith(
        '@test/plugin',
        {
          id: 'test-block',
        },
        expect.objectContaining({
          name: '@test/plugin',
        })
      );
    });

    test('onBlockEmit callback delegates to event handler', async () => {
      const callbacks = await loadPlugin();
      callbacks.onBlockEmit('instance-1', 'output', {
        value: 42,
      });
      expect(mockEventHandler.onBlockEmit).toHaveBeenCalledWith('instance-1', 'output', {
        value: 42,
      });
    });

    test('onBlockLog callback delegates to event handler', async () => {
      const callbacks = await loadPlugin();
      callbacks.onBlockLog('instance-1', 'workflow-1', 'info', 'Block log message');
      expect(mockEventHandler.onBlockLog).toHaveBeenCalledWith(
        'instance-1',
        'workflow-1',
        'info',
        'Block log message'
      );
    });

    test('onSpark callback delegates to event handler', async () => {
      const callbacks = await loadPlugin();
      callbacks.onSpark({
        id: 'test-spark',
      });
      expect(mockEventHandler.registerSpark).toHaveBeenCalledWith('@test/plugin', {
        id: 'test-spark',
      });
    });

    test('onSparkEmit callback delegates to event handler', async () => {
      const callbacks = await loadPlugin();
      callbacks.onSparkEmit('my-spark', {
        data: 'payload',
      });
      expect(mockEventHandler.emitSpark).toHaveBeenCalledWith('@test/plugin', 'my-spark', {
        data: 'payload',
      });
    });

    test('onSparkSubscribe callback delegates to event handler', async () => {
      const callbacks = await loadPlugin();
      const process = mockProcessInstance as unknown as PluginProcess;
      callbacks.onSparkSubscribe('some:type', 'sub-1', process);
      expect(mockEventHandler.subscribeToSparks).toHaveBeenCalledWith(
        'some:type',
        expect.any(Function)
      );
    });

    test('onBrickType callback delegates to event handler with manifest', async () => {
      const callbacks = await loadPlugin();
      callbacks.onBrickType({
        id: 'test-brick',
        families: ['sm' as const],
      });
      expect(mockEventHandler.registerBrickType).toHaveBeenCalledWith(
        '@test/plugin',
        {
          id: 'test-brick',
          families: ['sm'],
        },
        {
          id: 'test-brick',
        },
        expect.any(String)
      );
    });

    test('onRoute callback delegates to event handler', async () => {
      const callbacks = await loadPlugin();
      callbacks.onRoute('GET', '/oauth/callback');
      expect(mockEventHandler.registerRoute).toHaveBeenCalledWith(
        '@test/plugin',
        'GET',
        '/oauth/callback'
      );
    });

    test('onUpdatePreference callback updates plugin config', async () => {
      mockPluginConfig.getConfig.mockResolvedValue({
        existingKey: 'value',
      });
      const callbacks = await loadPlugin();
      await callbacks.onUpdatePreference('newKey', 'newValue');
      expect(mockPluginConfig.setConfig).toHaveBeenCalledWith('@test/plugin', {
        existingKey: 'value',
        newKey: 'newValue',
      });
    });

    test('onMetrics callback records metrics', async () => {
      const callbacks = await loadPlugin();
      const process = mockProcessInstance as unknown as PluginProcess;
      callbacks.onMetrics?.(process, 15.5, 1024000);
      expect(mockMetrics.record).toHaveBeenCalledWith('@test/plugin', {
        ts: expect.any(Number),
        cpu: 15.5,
        memory: 1024000,
      });
    });

    test('onSetPluginSecret writes under the user.* keychain namespace', async () => {
      const callbacks = await loadPlugin();
      await callbacks.onSetPluginSecret('@test/plugin', 'session-token', 'tok-123');

      // The hub hardcodes the `user.` prefix; plugin-supplied keys can never
      // collide with declared password prefs or __secret_* SDK keys.
      expect(
        secretsMock.store.get(`${brikaContext.serviceName}::@test/plugin::user.session-token`)
      ).toBe('tok-123');
      expect(
        secretsMock.store.get(`${brikaContext.serviceName}::@test/plugin::session-token`)
      ).toBeUndefined();
    });

    test('onGetPluginSecret reads from the user.* namespace', async () => {
      const callbacks = await loadPlugin();
      secretsMock.store.set(`${brikaContext.serviceName}::@test/plugin::user.api-key`, 'sk-real');

      expect(await callbacks.onGetPluginSecret('@test/plugin', 'api-key')).toBe('sk-real');
    });

    test('onGetPluginSecret returns null when the secret is missing', async () => {
      const callbacks = await loadPlugin();
      expect(await callbacks.onGetPluginSecret('@test/plugin', 'missing')).toBeNull();
    });

    test('onSetPluginSecret with empty value deletes the secret', async () => {
      const callbacks = await loadPlugin();
      await callbacks.onSetPluginSecret('@test/plugin', 'token', 'value');
      await callbacks.onSetPluginSecret('@test/plugin', 'token', '');

      expect(await callbacks.onGetPluginSecret('@test/plugin', 'token')).toBeNull();
    });

    test('onDeletePluginSecret removes the secret and reports whether it existed', async () => {
      const callbacks = await loadPlugin();
      await callbacks.onSetPluginSecret('@test/plugin', 'token', 'value');

      expect(await callbacks.onDeletePluginSecret('@test/plugin', 'token')).toBe(true);
      expect(await callbacks.onDeletePluginSecret('@test/plugin', 'token')).toBe(false);
    });

    test('plugin-supplied keys cannot reach declared password prefs or __secret_* namespace', async () => {
      const callbacks = await loadPlugin();

      // Pretend the plugin had set `apiKey` (a declared password pref). It lives
      // at `@test/plugin::apiKey`.
      secretsMock.store.set(`${brikaContext.serviceName}::@test/plugin::apiKey`, 'pref-secret');
      // And a hub-managed OAuth token at the SDK __secret_* namespace.
      secretsMock.store.set(
        `${brikaContext.serviceName}::@test/plugin::__secret_oauth_test_token`,
        '"oauth-blob"'
      );

      // Plugin tries to read those names directly — must not find them.
      expect(await callbacks.onGetPluginSecret('@test/plugin', 'apiKey')).toBeNull();
      expect(
        await callbacks.onGetPluginSecret('@test/plugin', '__secret_oauth_test_token')
      ).toBeNull();
    });

    test('plugin secrets are isolated per plugin name (channel identity)', async () => {
      const callbacks = await loadPlugin();
      await callbacks.onSetPluginSecret('@test/plugin', 'shared-key', 'a-value');

      // A different plugin asking for the same key must not see it.
      expect(await callbacks.onGetPluginSecret('@other/plugin', 'shared-key')).toBeNull();
    });
  });

  describe('onStderr (spawnPlugin callback)', () => {
    test('onStderr captures plugin stderr output', async () => {
      await loadPlugin();
      expect(capturedSpawnStderr).not.toBeNull();
      capturedSpawnStderr?.('Some error output');
    });
  });

  describe('#handleHeartbeatFailed', () => {
    test('sets health to crashed and triggers unload', async () => {
      const callbacks = await loadPlugin();
      const process = mockProcessInstance as unknown as PluginProcess;
      callbacks.onHeartbeatFailed(process, 10000);
      expect(mockState.setHealth).toHaveBeenCalledWith(
        '@test/plugin',
        'crashed',
        expect.objectContaining({
          key: 'plugins:errors.heartbeatTimeout',
        })
      );
    });
  });

  describe('#handleDisconnect', () => {
    test('handles plugin disconnect with error', async () => {
      const callbacks = await loadPlugin();
      const process = mockProcessInstance as unknown as PluginProcess;
      callbacks.onDisconnect(process, new Error('Connection lost'));
      expect(mockState.setHealth).toHaveBeenCalledWith(
        '@test/plugin',
        'crashed',
        expect.objectContaining({
          key: 'plugins:errors.crashed',
          params: {
            reason: 'Connection lost',
          },
        })
      );
      expect(mockEvents.dispatch).toHaveBeenCalled();
    });

    test('handles plugin disconnect without error', async () => {
      const callbacks = await loadPlugin();
      const process = mockProcessInstance as unknown as PluginProcess;
      callbacks.onDisconnect(process);
      expect(mockState.setHealth).toHaveBeenCalledWith(
        '@test/plugin',
        'crashed',
        expect.objectContaining({
          key: 'plugins:errors.crashed',
          params: {
            reason: 'disconnected',
          },
        })
      );
    });

    test('spawnPlugin onDisconnect is a no-op when process already removed', async () => {
      await loadPlugin();
      await lifecycle.unload('@test/plugin');
      expect(capturedSpawnDisconnect).not.toBeNull();
      capturedSpawnDisconnect?.(new Error('late disconnect'));
    });
  });

  describe('#attemptAutoRestart', () => {
    test('does not restart when autoRestartEnabled is false', async () => {
      mockConfig.autoRestartEnabled = false;
      lifecycle = get(PluginLifecycleMocked);

      const callbacks = await loadPlugin();
      const process = mockProcessInstance as unknown as PluginProcess;
      callbacks.onDisconnect(process, new Error('crash'));
      // Negative assertion: confirm no restart scheduled
      await sleep(20);

      const healthCalls = mockState.setHealth.mock.calls;
      const restartingCalls = healthCalls.filter(
        (c: unknown[]) =>
          c[0] === '@test/plugin' &&
          c[1] === 'restarting' &&
          typeof c[2] === 'string' &&
          (c[2] as string).startsWith('Restarting in')
      );
      expect(restartingCalls.length).toBe(0);
    });

    test('does not restart when plugin is disabled', async () => {
      mockState.get.mockReturnValue({
        enabled: false,
      });

      const callbacks = await loadPlugin();
      const process = mockProcessInstance as unknown as PluginProcess;
      callbacks.onDisconnect(process, new Error('crash'));
      // Negative assertion: confirm no restart scheduled when disabled
      await sleep(20);

      const healthCalls = mockState.setHealth.mock.calls;
      const restartingCalls = healthCalls.filter(
        (c: unknown[]) =>
          c[0] === '@test/plugin' &&
          c[1] === 'restarting' &&
          typeof c[2] === 'string' &&
          (c[2] as string).startsWith('Restarting in')
      );
      expect(restartingCalls.length).toBe(0);
    });

    test('schedules restart when plugin is enabled', async () => {
      mockState.get.mockReturnValue({
        enabled: true,
      });

      const callbacks = await loadPlugin();
      const process = mockProcessInstance as unknown as PluginProcess;
      callbacks.onDisconnect(process, new Error('crash'));
      await waitFor(() =>
        mockState.setHealth.mock.calls.some(
          (c: unknown[]) =>
            c[0] === '@test/plugin' &&
            c[1] === 'restarting' &&
            typeof c[2] === 'object' &&
            (c[2] as Record<string, unknown>).key === 'plugins:errors.restarting'
        )
      );

      const healthCalls = mockState.setHealth.mock.calls;
      const restartingCalls = healthCalls.filter(
        (c: unknown[]) =>
          c[0] === '@test/plugin' &&
          c[1] === 'restarting' &&
          typeof c[2] === 'object' &&
          (c[2] as Record<string, unknown>).key === 'plugins:errors.restarting'
      );
      expect(restartingCalls.length).toBeGreaterThanOrEqual(1);
    });

    test('detects crash loop after max crashes', async () => {
      mockState.get.mockReturnValue({
        enabled: true,
      });
      // Note: PluginLifecycle is @singleton() so the instance from beforeEach is reused.
      // The RestartPolicy was constructed with default restartMaxCrashes (5), so we
      // need to exceed that threshold by crashing more than 5 times.

      for (let i = 0; i < 6; i++) {
        capturedCallbacks = null;
        mockProcessInstance = null;
        const setHealthCallsBefore = mockState.setHealth.mock.calls.length;
        try {
          await lifecycle.load('/mock/path', true);
        } catch {
          // May fail on subsequent loads
        }
        if (capturedCallbacks !== null && mockProcessInstance !== null) {
          const cbs = capturedCallbacks as PluginProcessCallbacks;
          const process = mockProcessInstance as unknown as PluginProcess;
          cbs.onDisconnect(process, new Error(`crash-${i}`));
          // Wait for fire-and-forget unload() (50ms internal delay) to surface a health update
          await waitFor(() => mockState.setHealth.mock.calls.length > setHealthCallsBefore, {
            timeoutMs: 1000,
          });
        }
      }

      const healthCalls = mockState.setHealth.mock.calls;
      const crashLoopCalls = healthCalls.filter((c: unknown[]) => c[1] === 'crash-loop');
      expect(crashLoopCalls.length).toBeGreaterThanOrEqual(1);
    }, 10_000);
  });

  describe('#handleRssSoftLimitBreached', () => {
    const MB = 1024 * 1024;

    test('emits the breach event and marks the plugin crashed', async () => {
      const callbacks = await loadPlugin();
      const process = mockProcessInstance as unknown as PluginProcess;

      callbacks.onRssSoftLimitBreached?.(process, 600 * MB, 512 * MB);

      // Operators get a structured resource-governance signal.
      expect(mockEventHandler.onRssSoftLimitBreached).toHaveBeenCalledWith(
        process.uid,
        '@test/plugin',
        600 * MB,
        512 * MB
      );
      // The breach is recorded as a crash carrying the rssSoftLimit error.
      expect(mockState.setHealth).toHaveBeenCalledWith(
        '@test/plugin',
        'crashed',
        expect.objectContaining({
          key: 'plugins:errors.rssSoftLimit',
          params: { rssMb: '600', limitMb: '512' },
        })
      );
    });

    test('swallows a rejected post-breach unload without crashing', async () => {
      // Force unload() to reject — it calls metrics.clear(name) internally.
      // The breach handler must catch it (log + continue) rather than throw
      // an unhandled rejection.
      mockMetrics.clear.mockImplementation(() => {
        throw new Error('clear failed');
      });

      const callbacks = await loadPlugin();
      const process = mockProcessInstance as unknown as PluginProcess;

      callbacks.onRssSoftLimitBreached?.(process, 700 * MB, 512 * MB);

      // The breach was still recorded as a crash, and the rejected unload is
      // handled by the .catch (proven by clear being invoked + no throw).
      await waitFor(() => mockMetrics.clear.mock.calls.length > 0);
      expect(mockEventHandler.onRssSoftLimitBreached).toHaveBeenCalled();
      // Settle the rejected promise's .catch handler.
      await sleep(10);
    });

    test('funnels through the auto-restart path so the breach is treated like a crash', async () => {
      mockState.get.mockReturnValue({ enabled: true });

      const callbacks = await loadPlugin();
      const process = mockProcessInstance as unknown as PluginProcess;

      callbacks.onRssSoftLimitBreached?.(process, 700 * MB, 512 * MB);

      // After the graceful unload, the RestartPolicy schedules a restart —
      // a leaking plugin that keeps tripping the limit is handled like a crash.
      await waitFor(() =>
        mockState.setHealth.mock.calls.some(
          (c: unknown[]) =>
            c[0] === '@test/plugin' &&
            c[1] === 'restarting' &&
            typeof c[2] === 'object' &&
            (c[2] as Record<string, unknown>).key === 'plugins:errors.restarting'
        )
      );
    });
  });

  describe('#checkCompatibility', () => {
    test('persists plugin without engines.brika as incompatible', async () => {
      resolverSpy.mockResolvedValue({
        rootDirectory: '/mock/path',
        entryPoint: '/mock/path/index.js',
        metadata: {
          name: '@test/no-engines',
          version: '1.0.0',
          main: 'index.js',
        },
      } as never);

      lifecycle = get(PluginLifecycleMocked);
      await lifecycle.load('/mock/path');

      expect(mockState.registerPlugin).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '@test/no-engines',
          enabled: false,
        })
      );
      expect(mockState.setHealth).toHaveBeenCalledWith(
        '@test/no-engines',
        'incompatible',
        expect.objectContaining({
          key: 'plugins:errors.incompatibleUnknown',
          message: 'Missing engines.brika in package.json',
        })
      );
    });

    test('persists plugin with incompatible brika version as incompatible', async () => {
      resolverSpy.mockResolvedValue({
        rootDirectory: '/mock/path',
        entryPoint: '/mock/path/index.js',
        metadata: {
          name: '@test/incompat',
          version: '1.0.0',
          main: 'index.js',
          engines: {
            brika: '^99.0.0',
          },
        },
      } as never);

      lifecycle = get(PluginLifecycleMocked);
      await lifecycle.load('/mock/path');

      expect(mockState.registerPlugin).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '@test/incompat',
          enabled: false,
        })
      );
      expect(mockState.setHealth).toHaveBeenCalledWith(
        '@test/incompat',
        'incompatible',
        expect.objectContaining({
          key: 'plugins:errors.incompatibleVersion',
          params: expect.objectContaining({
            required: '^99.0.0',
          }),
        })
      );
    });
  });
});
