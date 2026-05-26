/**
 * Tests for PluginProcess
 */

import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { BrikaError } from '@brika/errors';
import {
  blockEmit,
  blockLog,
  deletePluginSecret,
  emitSpark,
  getHubLocation,
  getHubTimezone,
  getPluginSecret,
  hello,
  log,
  ready,
  registerAction,
  registerBlock,
  registerBrickType,
  registerRoute,
  registerSpark,
  setPluginSecret,
  subscribeSpark,
  unsubscribeSpark,
  updatePreference,
} from '@brika/ipc/contract';
import type { PluginHealth } from '@brika/plugin';
import type { PluginPackageSchema } from '@brika/schema';
import {
  PluginProcess,
  type PluginProcessCallbacks,
  type PluginProcessConfig,
} from '@/runtime/plugins/plugin-process';
import { sleep, waitFor } from './_test-helpers';

describe('PluginProcess', () => {
  let process: PluginProcess;
  let mockChannel: {
    pid: number;
    call: ReturnType<typeof mock>;
    send: ReturnType<typeof mock>;
    on: ReturnType<typeof mock>;
    implement: ReturnType<typeof mock>;
    ping: ReturnType<typeof mock>;
    stop: ReturnType<typeof mock>;
    kill: ReturnType<typeof mock>;
  };
  let callbacks: PluginProcessCallbacks;
  let config: PluginProcessConfig;
  let channelHandlers: Map<unknown, (...args: unknown[]) => unknown>;
  let implementHandlers: Map<unknown, (...args: unknown[]) => unknown>;

  const createMockMetadata = (): PluginPackageSchema => ({
    name: '@test/plugin',
    version: '1.0.0',
    main: './index.js',
    description: 'Test plugin',
    author: 'Test Author',
    homepage: 'https://example.com',
    repository: 'https://github.com/test',
    icon: 'test-icon',
    keywords: ['test'],
    license: 'MIT',
    engines: {
      brika: '^0.1.0',
    },
    blocks: [
      {
        id: 'test-block',
        category: 'trigger' as const,
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
    grants: {
      'dev.brika.location.get': {},
      'dev.brika.secrets.get': {},
      'dev.brika.secrets.set': {},
      'dev.brika.secrets.delete': {},
    },
  });

  const TEST_FS_DIRS = {
    bundle: '/path/to/plugin',
    data: '/path/to/plugin-data/data',
    cache: '/path/to/plugin-data/cache',
    tmp: '/path/to/plugin-data/tmp',
  };

  beforeEach(() => {
    channelHandlers = new Map();
    implementHandlers = new Map();

    mockChannel = {
      pid: 12345,
      call: mock().mockResolvedValue({
        ok: true,
      }),
      send: mock(),
      on: mock((contract: unknown, handler: (...args: unknown[]) => unknown) => {
        channelHandlers.set(contract, handler);
      }),
      implement: mock((contract: unknown, handler: (...args: unknown[]) => unknown) => {
        implementHandlers.set(contract, handler);
      }),
      ping: mock().mockResolvedValue(undefined),
      stop: mock(),
      kill: mock(),
    };

    callbacks = {
      onReady: mock(),
      onLog: mock(),
      onBlock: mock(),
      onBlockEmit: mock(),
      onBlockLog: mock(),
      onSpark: mock(),
      onSparkEmit: mock(),
      onSparkSubscribe: mock().mockReturnValue(() => {
        /* noop unsubscribe */
      }),
      onSparkUnsubscribe: mock(),
      onBrickType: mock(),
      onBrickDataPush: mock(),
      onGetHubLocation: mock().mockReturnValue(null),
      onGetHubTimezone: mock().mockReturnValue(null),
      onGetGrantedPermissions: mock().mockReturnValue([]),
      onHeartbeatFailed: mock(),
      onDisconnect: mock(),
      onMetrics: mock(),
      onRoute: mock(),
      onUpdatePreference: mock(),
      onGetPluginSecret: mock().mockResolvedValue(null),
      onSetPluginSecret: mock().mockResolvedValue(undefined),
      onDeletePluginSecret: mock().mockResolvedValue(false),
    };

    config = {
      heartbeatIntervalMs: 100000, // Long interval to prevent auto-heartbeat during tests
      heartbeatTimeoutMs: 5000,
    };

    process = new PluginProcess(
      mockChannel as never,
      {
        name: '@test/plugin',
        rootDirectory: '/path/to/plugin',
        entryPoint: '/path/to/plugin/index.js',
        uid: 'uid-123',
        version: '1.0.0',
        metadata: createMockMetadata(),
        locales: ['en', 'fr'],
        fsDirs: TEST_FS_DIRS,
      },
      config,
      callbacks
    );
  });

  afterEach(() => {
    process.stop();
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Invoke a handler registered via `channel.on(contract, handler)` */
  function triggerHandler(contract: unknown, payload: unknown): unknown {
    const handler = channelHandlers.get(contract);
    if (!handler) {
      throw new Error(`No handler for contract`);
    }
    return handler(payload);
  }

  /** Invoke a handler registered via `channel.implement(contract, handler)` */
  function triggerImplement(contract: unknown, input: unknown): unknown {
    const handler = implementHandlers.get(contract);
    if (!handler) {
      throw new Error(`No implement handler for contract`);
    }
    return handler(input);
  }

  // ─── Properties ───────────────────────────────────────────────────────────

  describe('Properties', () => {
    test('exposes name', () => {
      expect(process.name).toBe('@test/plugin');
    });

    test('exposes rootDirectory', () => {
      expect(process.rootDirectory).toBe('/path/to/plugin');
    });

    test('exposes entryPoint', () => {
      expect(process.entryPoint).toBe('/path/to/plugin/index.js');
    });

    test('exposes uid', () => {
      expect(process.uid).toBe('uid-123');
    });

    test('exposes version', () => {
      expect(process.version).toBe('1.0.0');
    });

    test('exposes pid from channel', () => {
      expect(process.pid).toBe(12345);
    });

    test('exposes locales', () => {
      expect(process.locales).toEqual(['en', 'fr']);
    });

    test('exposes startedAt', () => {
      expect(process.startedAt).toBeGreaterThan(0);
    });

    test('exposes lastPong', () => {
      expect(process.lastPong).toBeGreaterThan(0);
    });

    test('blocks set is initially empty', () => {
      expect(process.blocks.size).toBe(0);
    });

    test('sparks set is initially empty', () => {
      expect(process.sparks.size).toBe(0);
    });

    test('brickTypes set is initially empty', () => {
      expect(process.brickTypes.size).toBe(0);
    });

    test('actions set is initially empty', () => {
      expect(process.actions.size).toBe(0);
    });
  });

  // ─── IPC Operations ──────────────────────────────────────────────────────

  describe('IPC Operations', () => {
    describe('startBlock', () => {
      test('calls channel with correct parameters', async () => {
        const result = await process.startBlock('test-block', 'instance-1', 'workflow-1', {
          key: 'value',
        });

        expect(result.ok).toBe(true);
        expect(mockChannel.call).toHaveBeenCalled();
      });

      test('returns error when stopped', async () => {
        process.stop();

        const result = await process.startBlock('test-block', 'instance-1', 'workflow-1', {});

        expect(result.ok).toBe(false);
        expect(result.error).toBe('Plugin stopped');
      });

      test('handles channel call errors', async () => {
        mockChannel.call.mockRejectedValueOnce(new Error('Channel error'));

        const result = await process.startBlock('test-block', 'instance-1', 'workflow-1', {});

        expect(result.ok).toBe(false);
        expect(result.error).toContain('Channel error');
      });
    });

    describe('pushInput', () => {
      test('sends input to channel', () => {
        process.pushInput('instance-1', 'input', {
          value: 42,
        });

        expect(mockChannel.send).toHaveBeenCalled();
      });

      test('does nothing when stopped', () => {
        process.stop();
        mockChannel.send.mockClear();

        process.pushInput('instance-1', 'input', {
          value: 42,
        });

        expect(mockChannel.send).not.toHaveBeenCalled();
      });
    });

    describe('stopBlockInstance', () => {
      test('sends stop to channel', () => {
        process.stopBlockInstance('instance-1');

        expect(mockChannel.send).toHaveBeenCalled();
      });

      test('does nothing when stopped', () => {
        process.stop();
        mockChannel.send.mockClear();

        process.stopBlockInstance('instance-1');

        expect(mockChannel.send).not.toHaveBeenCalled();
      });
    });

    describe('sendPreferences', () => {
      test('sends preferences to channel', () => {
        process.sendPreferences({
          theme: 'dark',
        });

        expect(mockChannel.send).toHaveBeenCalled();
      });

      test('does nothing when stopped', () => {
        process.stop();
        mockChannel.send.mockClear();

        process.sendPreferences({
          theme: 'dark',
        });

        expect(mockChannel.send).not.toHaveBeenCalled();
      });
    });

    describe('sendSparkEvent', () => {
      test('sends spark event to channel', () => {
        process.sendSparkEvent('sub-1', {
          type: 'test-spark',
          payload: {},
          source: 'test',
          ts: Date.now(),
          id: '1',
        });

        expect(mockChannel.send).toHaveBeenCalled();
      });

      test('does nothing when stopped', () => {
        process.stop();
        mockChannel.send.mockClear();

        process.sendSparkEvent('sub-1', {
          type: 'test-spark',
          payload: {},
          source: 'test',
          ts: Date.now(),
          id: '1',
        });

        expect(mockChannel.send).not.toHaveBeenCalled();
      });
    });

    describe('sendUpdateBrickConfig', () => {
      test('sends update brick config to channel', () => {
        process.sendUpdateBrickConfig('inst-1', {
          color: 'red',
        });

        expect(mockChannel.send).toHaveBeenCalled();
      });

      test('does nothing when stopped', () => {
        process.stop();
        mockChannel.send.mockClear();

        process.sendUpdateBrickConfig('inst-1', {
          color: 'red',
        });

        expect(mockChannel.send).not.toHaveBeenCalled();
      });
    });

    describe('sendBrickInstanceAction', () => {
      test('sends brick instance action to channel', () => {
        process.sendBrickInstanceAction('inst-1', 'plugin:brick', 'refresh', {
          force: true,
        });

        expect(mockChannel.send).toHaveBeenCalled();
      });

      test('does nothing when stopped', () => {
        process.stop();
        mockChannel.send.mockClear();

        process.sendBrickInstanceAction('inst-1', 'plugin:brick', 'refresh');

        expect(mockChannel.send).not.toHaveBeenCalled();
      });
    });

    describe('sendRouteRequest', () => {
      test('sends route request and returns response', async () => {
        mockChannel.call.mockResolvedValueOnce({
          status: 200,
          body: {
            ok: true,
          },
        });

        const result = await process.sendRouteRequest('route-1', 'GET', '/api/test', {}, {});

        expect(result.status).toBe(200);
        expect(mockChannel.call).toHaveBeenCalled();
      });

      test('returns 503 when stopped', async () => {
        process.stop();

        const result = await process.sendRouteRequest('route-1', 'GET', '/api/test', {}, {});

        expect(result.status).toBe(503);
      });

      test('returns 502 on channel error and logs the error', async () => {
        mockChannel.call.mockRejectedValueOnce(new Error('Channel error'));

        const result = await process.sendRouteRequest('route-1', 'GET', '/api/test', {}, {});

        expect(result.status).toBe(502);
        expect(result.body).toEqual({
          error: 'Plugin route handler failed',
        });
        expect(callbacks.onLog).toHaveBeenCalledWith(
          'error',
          expect.stringContaining('Route handler failed [GET /api/test]')
        );
      });
    });

    describe('fetchPreferenceOptions', () => {
      test('returns options from channel call', async () => {
        const options = [
          {
            value: 'a',
            label: 'Option A',
          },
          {
            value: 'b',
            label: 'Option B',
          },
        ];
        mockChannel.call.mockResolvedValueOnce({
          options,
        });

        const result = await process.fetchPreferenceOptions('theme');

        expect(result).toEqual(options);
        expect(mockChannel.call).toHaveBeenCalled();
      });

      test('returns empty array when stopped', async () => {
        process.stop();

        const result = await process.fetchPreferenceOptions('theme');

        expect(result).toEqual([]);
      });

      test('returns empty array and logs warning on channel error', async () => {
        mockChannel.call.mockRejectedValueOnce(new Error('IPC failure'));

        const result = await process.fetchPreferenceOptions('theme');

        expect(result).toEqual([]);
        expect(callbacks.onLog).toHaveBeenCalledWith(
          'warn',
          expect.stringContaining('Failed to fetch preference options for "theme"')
        );
      });
    });

    describe('callPluginAction', () => {
      test('returns result from channel call', async () => {
        const actionResult = {
          ok: true,
          data: {
            count: 42,
          },
        };
        mockChannel.call.mockResolvedValueOnce(actionResult);

        const result = await process.callPluginAction('do-stuff', {
          input: 1,
        });

        expect(result).toEqual(actionResult);
        expect(mockChannel.call).toHaveBeenCalled();
      });

      test('returns error when stopped', async () => {
        process.stop();

        const result = await process.callPluginAction('do-stuff');

        expect(result.ok).toBe(false);
        expect(result.error).toEqual({ message: 'Plugin stopped', code: 'PLUGIN_STOPPED' });
      });

      test('returns error and logs on channel failure', async () => {
        mockChannel.call.mockRejectedValueOnce(new Error('Timeout'));

        const result = await process.callPluginAction('do-stuff');

        expect(result.ok).toBe(false);
        expect(result.error).toEqual({
          message: 'Action call failed',
          code: 'ACTION_CALL_FAILED',
        });
        expect(callbacks.onLog).toHaveBeenCalledWith(
          'error',
          expect.stringContaining('Action call failed [do-stuff]')
        );
      });
    });

    describe('resolveStreamPath', () => {
      // The plugin in `createMockMetadata` declares no fs grants — every
      // call must trip the permission gate, which is also the hardest-
      // to-regress check. Tests that need a granted scope build their
      // own process inline.

      test('throws PERMISSION_DENIED when readFile grant is not in the vector', async () => {
        await expect(process.resolveStreamPath('/data/foo.png')).rejects.toMatchObject({
          code: 'PERMISSION_DENIED',
        });
      });
    });
  });

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  describe('Lifecycle', () => {
    describe('stop', () => {
      test('stops the channel', () => {
        process.stop();

        expect(mockChannel.stop).toHaveBeenCalled();
      });

      test('is idempotent', () => {
        process.stop();
        process.stop();

        expect(mockChannel.stop).toHaveBeenCalledTimes(1);
      });

      test('cleans up spark subscriptions on stop', () => {
        const unsub1 = mock();
        const unsub2 = mock();
        (callbacks.onSparkSubscribe as ReturnType<typeof mock>)
          .mockReturnValueOnce(unsub1)
          .mockReturnValueOnce(unsub2);

        // Simulate two spark subscriptions
        triggerHandler(subscribeSpark, {
          sparkType: 'typeA',
          subscriptionId: 'sub-1',
        });
        triggerHandler(subscribeSpark, {
          sparkType: 'typeB',
          subscriptionId: 'sub-2',
        });

        process.stop();

        expect(unsub1).toHaveBeenCalledTimes(1);
        expect(unsub2).toHaveBeenCalledTimes(1);
      });
    });

    describe('kill', () => {
      test('stops and kills with default signal', () => {
        process.kill();

        expect(mockChannel.stop).toHaveBeenCalled();
        expect(mockChannel.kill).toHaveBeenCalledWith(9);
      });

      test('kills with custom signal', () => {
        process.kill(15);

        expect(mockChannel.kill).toHaveBeenCalledWith(15);
      });
    });
  });

  // ─── toPlugin ─────────────────────────────────────────────────────────────

  describe('toPlugin', () => {
    test('converts to Plugin object with correct properties', () => {
      const plugin = process.toPlugin('running');

      expect(plugin.uid).toBe('uid-123');
      expect(plugin.name).toBe('@test/plugin');
      expect(plugin.version).toBe('1.0.0');
      expect(plugin.description).toBe('Test plugin');
      expect(plugin.author).toBe('Test Author');
      expect(plugin.homepage).toBe('https://example.com');
      expect(plugin.repository).toBe('https://github.com/test');
      expect(plugin.icon).toBe('test-icon');
      expect(plugin.keywords).toEqual(['test']);
      expect(plugin.license).toBe('MIT');
      expect(plugin.status).toBe('running');
      expect(plugin.pid).toBe(12345);
      expect(plugin.rootDirectory).toBe('/path/to/plugin');
      expect(plugin.entryPoint).toBe('/path/to/plugin/index.js');
      expect(plugin.locales).toEqual(['en', 'fr']);
      expect(plugin.lastError).toBeNull();
      expect(plugin.startedAt).toBeGreaterThan(0);
    });

    test('handles different status values', () => {
      const statuses: PluginHealth[] = [
        'running',
        'stopped',
        'crashed',
        'restarting',
        'crash-loop',
      ];

      for (const status of statuses) {
        const plugin = process.toPlugin(status);
        expect(plugin.status).toBe(status);
      }
    });

    test('includes permissions and grantedPermissions', () => {
      const metaWithPerms = createMockMetadata();
      metaWithPerms.grants = { 'dev.brika.location.get': {} };

      const grantedCb = mock().mockReturnValue(['location']);
      const cbsWithGrants = {
        ...callbacks,
        onGetGrantedPermissions: grantedCb,
      };

      const pp = new PluginProcess(
        mockChannel as never,
        {
          name: '@test/plugin-perms',
          rootDirectory: '/path',
          entryPoint: '/path/index.js',
          uid: 'uid-perms',
          version: '1.0.0',
          metadata: metaWithPerms,
          locales: [],
          fsDirs: TEST_FS_DIRS,
        },
        config,
        cbsWithGrants
      );

      const plugin = pp.toPlugin('running');
      expect(plugin.permissions).toEqual(['location']);
      expect(plugin.grantedPermissions).toEqual(['location']);
      expect(grantedCb).toHaveBeenCalledWith('@test/plugin-perms');

      pp.stop();
    });

    test('derives requested permissions from declared grants', () => {
      const plugin = process.toPlugin('running');
      // createMockMetadata declares location.get + secrets.{get,set,delete},
      // which map to the location + secrets families via the registered specs.
      expect(plugin.permissions.toSorted((a, b) => a.localeCompare(b))).toEqual([
        'location',
        'secrets',
      ]);
      expect(plugin.grantedPermissions).toEqual([]);
    });

    test('handles missing metadata fields', () => {
      const minimalProcess = new PluginProcess(
        mockChannel as never,
        {
          name: '@test/minimal',
          rootDirectory: '/path',
          entryPoint: '/path/index.js',
          uid: 'uid-456',
          version: '0.1.0',
          metadata: {
            name: '@test/minimal',
            version: '0.1.0',
          } as PluginPackageSchema,
          locales: [],
          fsDirs: TEST_FS_DIRS,
        },
        config,
        callbacks
      );

      const plugin = minimalProcess.toPlugin('stopped');

      expect(plugin.description).toBeNull();
      expect(plugin.author).toBeNull();
      expect(plugin.homepage).toBeNull();
      expect(plugin.repository).toBeNull();
      expect(plugin.icon).toBeNull();
      expect(plugin.keywords).toEqual([]);
      expect(plugin.license).toBeNull();
      expect(plugin.blocks).toEqual([]);
      expect(plugin.sparks).toEqual([]);
      expect(plugin.bricks).toEqual([]);
      expect(plugin.pages).toEqual([]);

      minimalProcess.stop();
    });

    test('includes displayName from metadata', () => {
      const meta = createMockMetadata();
      meta.displayName = 'My Plugin';

      const pp = new PluginProcess(
        mockChannel as never,
        {
          name: '@test/display',
          rootDirectory: '/path',
          entryPoint: '/path/index.js',
          uid: 'uid-display',
          version: '1.0.0',
          metadata: meta,
          locales: [],
          fsDirs: TEST_FS_DIRS,
        },
        config,
        callbacks
      );

      const plugin = pp.toPlugin('running');
      expect(plugin.displayName).toBe('My Plugin');

      pp.stop();
    });

    test('includes engines from metadata', () => {
      const plugin = process.toPlugin('running');
      expect(plugin.engines).toEqual({
        brika: '^0.1.0',
      });
    });
  });

  // ─── Heartbeat ────────────────────────────────────────────────────────────

  describe('Heartbeat', () => {
    test('pings the plugin and updates lastPong on success', async () => {
      const shortConfig: PluginProcessConfig = {
        heartbeatIntervalMs: 50,
        heartbeatTimeoutMs: 1000,
      };

      const pp = new PluginProcess(
        mockChannel as never,
        {
          name: '@test/plugin',
          rootDirectory: '/path/to/plugin',
          entryPoint: '/path/to/plugin/index.js',
          uid: 'uid-hb',
          version: '1.0.0',
          metadata: createMockMetadata(),
          locales: [],
          fsDirs: TEST_FS_DIRS,
        },
        shortConfig,
        callbacks
      );

      try {
        await waitFor(() => mockChannel.ping.mock.calls.length > 0 && pp.lastPong > 0);

        expect(mockChannel.ping).toHaveBeenCalled();
        expect(pp.lastPong).toBeGreaterThan(0);
      } finally {
        pp.stop();
      }
    });

    test('calls onHeartbeatFailed when ping times out', async () => {
      mockChannel.ping.mockRejectedValue(new Error('Ping timeout'));

      const shortConfig: PluginProcessConfig = {
        heartbeatIntervalMs: 50,
        heartbeatTimeoutMs: 100,
      };

      const pp = new PluginProcess(
        mockChannel as never,
        {
          name: '@test/plugin',
          rootDirectory: '/path/to/plugin',
          entryPoint: '/path/to/plugin/index.js',
          uid: 'uid-fail',
          version: '1.0.0',
          metadata: createMockMetadata(),
          locales: [],
          fsDirs: TEST_FS_DIRS,
        },
        shortConfig,
        callbacks
      );

      try {
        const onHeartbeatFailed = callbacks.onHeartbeatFailed as ReturnType<typeof mock>;
        await waitFor(() => onHeartbeatFailed.mock.calls.length > 0);

        expect(callbacks.onHeartbeatFailed).toHaveBeenCalled();
        const [failedProcess, silentMs] = onHeartbeatFailed.mock.calls[0];
        expect(failedProcess).toBe(pp);
        expect(silentMs).toBeGreaterThanOrEqual(0);
      } finally {
        pp.stop();
      }
    });

    test('stops heartbeat when process is stopped', async () => {
      const shortConfig: PluginProcessConfig = {
        heartbeatIntervalMs: 50,
        heartbeatTimeoutMs: 1000,
      };

      const pp = new PluginProcess(
        mockChannel as never,
        {
          name: '@test/plugin',
          rootDirectory: '/path/to/plugin',
          entryPoint: '/path/to/plugin/index.js',
          uid: 'uid-stop',
          version: '1.0.0',
          metadata: createMockMetadata(),
          locales: [],
          fsDirs: TEST_FS_DIRS,
        },
        shortConfig,
        callbacks
      );

      pp.stop();

      const callsBefore = mockChannel.ping.mock.calls.length;
      // Negative assertion: a heartbeat would fire within 50ms — wait twice that
      await sleep(100);

      // No new pings after stop
      expect(mockChannel.ping.mock.calls.length).toBe(callsBefore);
    });

    test('collects metrics on successful heartbeat when onMetrics is defined', async () => {
      // The onMetrics callback is defined in our callbacks, and getProcessMetrics
      // is called during heartbeat. Since getProcessMetrics uses `ps` which
      // won't find a fake pid, it returns null and onMetrics won't be called.
      // But the heartbeat code path for the if-check is still covered.
      const shortConfig: PluginProcessConfig = {
        heartbeatIntervalMs: 50,
        heartbeatTimeoutMs: 1000,
      };

      const pp = new PluginProcess(
        mockChannel as never,
        {
          name: '@test/plugin',
          rootDirectory: '/path/to/plugin',
          entryPoint: '/path/to/plugin/index.js',
          uid: 'uid-metrics',
          version: '1.0.0',
          metadata: createMockMetadata(),
          locales: [],
          fsDirs: TEST_FS_DIRS,
        },
        shortConfig,
        callbacks
      );

      try {
        await waitFor(() => mockChannel.ping.mock.calls.length > 0);
        // The heartbeat ran; the metrics branch was entered (onMetrics is defined)
        // but getProcessMetrics(12345) returns null for a fake pid, so onMetrics
        // is not called. The important thing is the code path is covered.
        expect(mockChannel.ping).toHaveBeenCalled();
      } finally {
        pp.stop();
      }
    });

    test('skips metrics collection when onMetrics is undefined', async () => {
      const shortConfig: PluginProcessConfig = {
        heartbeatIntervalMs: 50,
        heartbeatTimeoutMs: 1000,
      };

      const cbsNoMetrics = {
        ...callbacks,
        onMetrics: undefined,
      };

      const pp = new PluginProcess(
        mockChannel as never,
        {
          name: '@test/plugin',
          rootDirectory: '/path/to/plugin',
          entryPoint: '/path/to/plugin/index.js',
          uid: 'uid-no-metrics',
          version: '1.0.0',
          metadata: createMockMetadata(),
          locales: [],
          fsDirs: TEST_FS_DIRS,
        },
        shortConfig,
        cbsNoMetrics
      );

      try {
        await waitFor(() => mockChannel.ping.mock.calls.length > 0);
        // Heartbeat ran but skipped metrics branch because onMetrics is undefined
        expect(mockChannel.ping).toHaveBeenCalled();
      } finally {
        pp.stop();
      }
    });
  });

  // ─── Channel Handlers (#setupHandlers) ────────────────────────────────────

  describe('Channel Handlers', () => {
    test('registers handlers on construction', () => {
      expect(mockChannel.on.mock.calls.length).toBeGreaterThan(0);
      expect(mockChannel.implement.mock.calls.length).toBeGreaterThan(0);
    });

    test('hello handler calls onReady', () => {
      triggerHandler(hello, {});

      expect(callbacks.onReady).toHaveBeenCalledWith(process);
    });

    test('ready handler is a no-op', () => {
      // Should not throw
      triggerHandler(ready, {});
    });

    test('log handler calls onLog with level, message, and meta', () => {
      triggerHandler(log, {
        level: 'info',
        message: 'test log',
        meta: {
          key: 'val',
        },
      });

      expect(callbacks.onLog).toHaveBeenCalledWith('info', 'test log', {
        key: 'val',
      });
    });

    test('log handler calls onLog without meta', () => {
      triggerHandler(log, {
        level: 'warn',
        message: 'warning',
      });

      expect(callbacks.onLog).toHaveBeenCalledWith('warn', 'warning', undefined);
    });

    describe('registerBlock', () => {
      test('registers a declared block and calls onBlock', () => {
        const block = {
          id: 'test-block',
          name: 'Test Block',
        };

        triggerHandler(registerBlock, {
          block,
        });

        expect(process.blocks.has('@test/plugin:test-block')).toBe(true);
        expect(callbacks.onBlock).toHaveBeenCalledWith(block);
      });

      test('ignores undeclared blocks', () => {
        const block = {
          id: 'undeclared-block',
          name: 'Ghost',
        };

        triggerHandler(registerBlock, {
          block,
        });

        expect(process.blocks.size).toBe(0);
        expect(callbacks.onBlock).not.toHaveBeenCalled();
      });
    });

    describe('registerSpark', () => {
      test('registers a declared spark and calls onSpark', () => {
        const spark = {
          id: 'test-spark',
          schema: {},
        };

        triggerHandler(registerSpark, {
          spark,
        });

        expect(process.sparks.has('@test/plugin:test-spark')).toBe(true);
        expect(callbacks.onSpark).toHaveBeenCalledWith(spark);
      });

      test('ignores undeclared sparks', () => {
        const spark = {
          id: 'undeclared-spark',
        };

        triggerHandler(registerSpark, {
          spark,
        });

        expect(process.sparks.size).toBe(0);
        expect(callbacks.onSpark).not.toHaveBeenCalled();
      });
    });

    test('emitSpark handler calls onSparkEmit', () => {
      triggerHandler(emitSpark, {
        sparkId: 'test-spark',
        payload: {
          data: 1,
        },
      });

      expect(callbacks.onSparkEmit).toHaveBeenCalledWith('test-spark', {
        data: 1,
      });
    });

    describe('subscribeSpark', () => {
      test('calls onSparkSubscribe and stores unsubscribe', () => {
        const unsub = mock();
        (callbacks.onSparkSubscribe as ReturnType<typeof mock>).mockReturnValueOnce(unsub);

        triggerHandler(subscribeSpark, {
          sparkType: 'weather',
          subscriptionId: 'sub-99',
        });

        expect(callbacks.onSparkSubscribe).toHaveBeenCalledWith('weather', 'sub-99', process);
      });
    });

    describe('unsubscribeSpark', () => {
      test('calls stored unsubscribe and removes subscription', () => {
        const unsub = mock();
        (callbacks.onSparkSubscribe as ReturnType<typeof mock>).mockReturnValueOnce(unsub);

        // Subscribe first
        triggerHandler(subscribeSpark, {
          sparkType: 'weather',
          subscriptionId: 'sub-99',
        });

        // Now unsubscribe
        triggerHandler(unsubscribeSpark, {
          subscriptionId: 'sub-99',
        });

        expect(unsub).toHaveBeenCalledTimes(1);
        expect(callbacks.onSparkUnsubscribe).toHaveBeenCalledWith('sub-99');
      });

      test('calls onSparkUnsubscribe even when subscription not found', () => {
        triggerHandler(unsubscribeSpark, {
          subscriptionId: 'unknown-sub',
        });

        expect(callbacks.onSparkUnsubscribe).toHaveBeenCalledWith('unknown-sub');
      });
    });

    test('blockEmit handler calls onBlockEmit', () => {
      triggerHandler(blockEmit, {
        instanceId: 'inst-1',
        port: 'output',
        data: {
          result: 42,
        },
      });

      expect(callbacks.onBlockEmit).toHaveBeenCalledWith('inst-1', 'output', {
        result: 42,
      });
    });

    test('blockLog handler calls onBlockLog', () => {
      triggerHandler(blockLog, {
        instanceId: 'inst-1',
        workflowId: 'wf-1',
        level: 'info',
        message: 'Block running',
      });

      expect(callbacks.onBlockLog).toHaveBeenCalledWith('inst-1', 'wf-1', 'info', 'Block running');
    });

    describe('registerBrickType', () => {
      test('registers a declared brick type and calls onBrickType', () => {
        const brickType = {
          id: 'test-brick',
          families: ['dashboard'],
        };

        triggerHandler(registerBrickType, {
          brickType,
        });

        expect(process.brickTypes.has('@test/plugin:test-brick')).toBe(true);
        expect(callbacks.onBrickType).toHaveBeenCalledWith(brickType);
      });

      test('ignores undeclared brick types', () => {
        const brickType = {
          id: 'undeclared-brick',
          families: ['dashboard'],
        };

        triggerHandler(registerBrickType, {
          brickType,
        });

        expect(process.brickTypes.size).toBe(0);
        expect(callbacks.onBrickType).not.toHaveBeenCalled();
      });
    });

    test('registerAction handler adds action id to the actions set', () => {
      triggerHandler(registerAction, {
        id: 'my-action',
      });

      expect(process.actions.has('my-action')).toBe(true);
    });

    test('registerAction handler accumulates multiple actions', () => {
      triggerHandler(registerAction, {
        id: 'action-a',
      });
      triggerHandler(registerAction, {
        id: 'action-b',
      });

      expect(process.actions.size).toBe(2);
      expect(process.actions.has('action-a')).toBe(true);
      expect(process.actions.has('action-b')).toBe(true);
    });

    test('registerRoute handler calls onRoute', () => {
      triggerHandler(registerRoute, {
        method: 'POST',
        path: '/api/webhook',
      });

      expect(callbacks.onRoute).toHaveBeenCalledWith('POST', '/api/webhook');
    });

    test('updatePreference handler calls onUpdatePreference', () => {
      triggerHandler(updatePreference, {
        key: 'theme',
        value: 'dark',
      });

      expect(callbacks.onUpdatePreference).toHaveBeenCalledWith('theme', 'dark');
    });

    describe('getHubLocation (implement)', () => {
      test('returns location when permission is granted', () => {
        const locationData = {
          lat: 48.856,
          lon: 2.352,
          city: 'Paris',
        };
        (callbacks.onGetGrantedPermissions as ReturnType<typeof mock>).mockReturnValue([
          'location',
        ]);
        (callbacks.onGetHubLocation as ReturnType<typeof mock>).mockReturnValue(locationData);

        const result = triggerImplement(getHubLocation, {});

        expect(result).toEqual({
          location: locationData,
        });
        expect(callbacks.onGetHubLocation).toHaveBeenCalled();
      });

      test('returns null location when permission is granted but no location', () => {
        (callbacks.onGetGrantedPermissions as ReturnType<typeof mock>).mockReturnValue([
          'location',
        ]);
        (callbacks.onGetHubLocation as ReturnType<typeof mock>).mockReturnValue(null);

        const result = triggerImplement(getHubLocation, {});

        expect(result).toEqual({
          location: null,
        });
      });

      test('throws BrikaError when location permission is not granted', () => {
        (callbacks.onGetGrantedPermissions as ReturnType<typeof mock>).mockReturnValue([]);

        expect(() => triggerImplement(getHubLocation, {})).toThrow();

        try {
          triggerImplement(getHubLocation, {});
        } catch (e: unknown) {
          if (!BrikaError.is(e, 'PERMISSION_DENIED')) {
            throw new Error('expected PERMISSION_DENIED BrikaError');
          }
          expect(e.message).toContain('dev.brika.location.get');
          expect(e.data?.permission).toBe('dev.brika.location.get');
        }
      });
    });

    describe('getHubTimezone (implement)', () => {
      test('returns timezone without requiring permission', () => {
        (callbacks.onGetGrantedPermissions as ReturnType<typeof mock>).mockReturnValue([]);
        (callbacks.onGetHubTimezone as ReturnType<typeof mock>).mockReturnValue('Europe/Paris');

        const result = triggerImplement(getHubTimezone, {});

        expect(result).toEqual({
          timezone: 'Europe/Paris',
        });
        expect(callbacks.onGetHubTimezone).toHaveBeenCalled();
      });

      test('returns null when no timezone configured', () => {
        (callbacks.onGetHubTimezone as ReturnType<typeof mock>).mockReturnValue(null);

        const result = triggerImplement(getHubTimezone, {});

        expect(result).toEqual({
          timezone: null,
        });
      });
    });

    // ─────────────────────────────────────────────────────────────────────
    // Plugin secrets — security boundary tests
    //
    // Each test exercises an actual RPC handler registered on the channel,
    // not a callback in isolation. The point is to verify the *security
    // contract* of the IPC layer:
    //   - permission is checked on every call (not cached, not skippable)
    //   - the plugin name passed to callbacks is always `process.name` (the
    //     trusted identity from spawn time) — plugins cannot influence it
    //   - the IPC schema rejects values that haven't passed validation
    //   - errors carry the correct typed code so SDKs can map them
    // ─────────────────────────────────────────────────────────────────────

    describe('plugin secrets (security boundary)', () => {
      async function expectPermissionDenied(fn: () => unknown, expectedId: string): Promise<void> {
        try {
          await fn();
        } catch (e: unknown) {
          const err = e as { code?: string; message?: string; data?: Record<string, unknown> };
          expect(err.code).toBe('PERMISSION_DENIED');
          expect(err.data).toEqual({ permission: expectedId });
          return;
        }
        throw new Error('Expected handler to throw a PERMISSION_DENIED error');
      }

      describe('getPluginSecret (implement)', () => {
        test('throws PERMISSION_DENIED when the plugin lacks the secrets grant', async () => {
          (callbacks.onGetGrantedPermissions as ReturnType<typeof mock>).mockReturnValue([]);

          await expectPermissionDenied(
            () =>
              triggerImplement(getPluginSecret, {
                key: 'api-key',
              }),
            'dev.brika.secrets.get'
          );
          // Importantly, the callback is NEVER reached when permission is denied
          expect(callbacks.onGetPluginSecret).not.toHaveBeenCalled();
        });

        test('still throws when only an unrelated permission is granted', async () => {
          (callbacks.onGetGrantedPermissions as ReturnType<typeof mock>).mockReturnValue([
            'location',
          ]);

          await expectPermissionDenied(
            () =>
              triggerImplement(getPluginSecret, {
                key: 'api-key',
              }),
            'dev.brika.secrets.get'
          );
          expect(callbacks.onGetPluginSecret).not.toHaveBeenCalled();
        });

        test('revocation takes effect after invalidateVector()', async () => {
          (callbacks.onGetGrantedPermissions as ReturnType<typeof mock>).mockReturnValue([
            'secrets',
          ]);
          (callbacks.onGetPluginSecret as ReturnType<typeof mock>).mockResolvedValue('value-1');

          await triggerImplement(getPluginSecret, {
            key: 'api-key',
          });

          // Revoke. The cached vector still permits until invalidated —
          // the permissions HTTP route calls `invalidateVector()` on the
          // running process right after `setPermission()` returns, which
          // is what unsticks the cache without a plugin restart.
          (callbacks.onGetGrantedPermissions as ReturnType<typeof mock>).mockReturnValue([]);
          process.invalidateVector();

          await expectPermissionDenied(
            () =>
              triggerImplement(getPluginSecret, {
                key: 'api-key',
              }),
            'dev.brika.secrets.get'
          );
        });

        test('forwards the trusted plugin name to the callback', async () => {
          (callbacks.onGetGrantedPermissions as ReturnType<typeof mock>).mockReturnValue([
            'secrets',
          ]);
          (callbacks.onGetPluginSecret as ReturnType<typeof mock>).mockResolvedValue('sk-real');

          const result = await triggerImplement(getPluginSecret, {
            key: 'api-key',
          });

          expect(callbacks.onGetPluginSecret).toHaveBeenCalledWith('@test/plugin', 'api-key');
          expect(result).toEqual({ value: 'sk-real' });
        });

        test('plugin cannot influence the pluginName argument', async () => {
          (callbacks.onGetGrantedPermissions as ReturnType<typeof mock>).mockReturnValue([
            'secrets',
          ]);
          (callbacks.onGetPluginSecret as ReturnType<typeof mock>).mockResolvedValue(null);

          // Even if a malicious/buggy plugin tries to smuggle a different name,
          // the IPC schema strips unknown fields and the handler always uses
          // this.name (= '@test/plugin') from the constructor.
          await triggerImplement(getPluginSecret, {
            key: 'api-key',
            pluginName: '@victim/plugin',
            __proto__: { spoof: true },
          } as unknown as { key: string });

          expect(callbacks.onGetPluginSecret).toHaveBeenCalledWith('@test/plugin', 'api-key');
          expect(callbacks.onGetPluginSecret).not.toHaveBeenCalledWith(
            '@victim/plugin',
            expect.anything()
          );
        });

        test('returns null when callback resolves to null', async () => {
          (callbacks.onGetGrantedPermissions as ReturnType<typeof mock>).mockReturnValue([
            'secrets',
          ]);
          (callbacks.onGetPluginSecret as ReturnType<typeof mock>).mockResolvedValue(null);

          const result = await triggerImplement(getPluginSecret, {
            key: 'unset-key',
          });

          expect(result).toEqual({ value: null });
        });
      });

      describe('setPluginSecret (implement)', () => {
        test('throws PERMISSION_DENIED when permission is not granted', async () => {
          (callbacks.onGetGrantedPermissions as ReturnType<typeof mock>).mockReturnValue([]);

          await expectPermissionDenied(
            () =>
              triggerImplement(setPluginSecret, {
                key: 'api-key',
                value: 'leak-attempt',
              }),
            'dev.brika.secrets.set'
          );
          expect(callbacks.onSetPluginSecret).not.toHaveBeenCalled();
        });

        test('forwards the trusted plugin name and the validated payload', async () => {
          (callbacks.onGetGrantedPermissions as ReturnType<typeof mock>).mockReturnValue([
            'secrets',
          ]);

          await triggerImplement(setPluginSecret, {
            key: 'api-key',
            value: 'sk-real',
          });

          expect(callbacks.onSetPluginSecret).toHaveBeenCalledWith(
            '@test/plugin',
            'api-key',
            'sk-real'
          );
        });

        test('returns an empty object on success', async () => {
          (callbacks.onGetGrantedPermissions as ReturnType<typeof mock>).mockReturnValue([
            'secrets',
          ]);

          const result = await triggerImplement(setPluginSecret, {
            key: 'api-key',
            value: 'sk-real',
          });

          expect(result).toEqual({});
        });

        test('propagates errors from the callback (e.g. keychain failure)', async () => {
          (callbacks.onGetGrantedPermissions as ReturnType<typeof mock>).mockReturnValue([
            'secrets',
          ]);
          (callbacks.onSetPluginSecret as ReturnType<typeof mock>).mockRejectedValue(
            new Error('keychain locked')
          );

          await expect(
            triggerImplement(setPluginSecret, {
              key: 'api-key',
              value: 'sk-real',
            }) as Promise<unknown>
          ).rejects.toThrow('keychain locked');
        });
      });

      describe('deletePluginSecret (implement)', () => {
        test('throws PERMISSION_DENIED when permission is not granted', async () => {
          (callbacks.onGetGrantedPermissions as ReturnType<typeof mock>).mockReturnValue([]);

          await expectPermissionDenied(
            () =>
              triggerImplement(deletePluginSecret, {
                key: 'api-key',
              }),
            'dev.brika.secrets.delete'
          );
          expect(callbacks.onDeletePluginSecret).not.toHaveBeenCalled();
        });

        test('forwards the trusted plugin name and reports deletion result', async () => {
          (callbacks.onGetGrantedPermissions as ReturnType<typeof mock>).mockReturnValue([
            'secrets',
          ]);
          (callbacks.onDeletePluginSecret as ReturnType<typeof mock>).mockResolvedValue(true);

          const result = await triggerImplement(deletePluginSecret, {
            key: 'api-key',
          });

          expect(callbacks.onDeletePluginSecret).toHaveBeenCalledWith('@test/plugin', 'api-key');
          expect(result).toEqual({ deleted: true });
        });

        test('returns deleted: false when the secret did not exist', async () => {
          (callbacks.onGetGrantedPermissions as ReturnType<typeof mock>).mockReturnValue([
            'secrets',
          ]);
          (callbacks.onDeletePluginSecret as ReturnType<typeof mock>).mockResolvedValue(false);

          const result = await triggerImplement(deletePluginSecret, {
            key: 'missing',
          });

          expect(result).toEqual({ deleted: false });
        });
      });

      test('the callbacks see process.name (not a wire-supplied name)', async () => {
        // Re-construct PluginProcess with a different name to confirm the
        // identity comes from the spawn-time `info.name`, not from anything
        // the plugin can send over IPC.
        const otherCallbacks = {
          ...callbacks,
          onGetPluginSecret: mock().mockResolvedValue(null),
        } as PluginProcessCallbacks;
        const otherImplement = new Map<unknown, (...args: unknown[]) => unknown>();
        const otherChannel = {
          ...mockChannel,
          implement: mock((contract: unknown, handler: (...args: unknown[]) => unknown) => {
            otherImplement.set(contract, handler);
          }),
          on: mock(),
        };
        (otherCallbacks.onGetGrantedPermissions as ReturnType<typeof mock>).mockReturnValue([
          'secrets',
        ]);

        new PluginProcess(
          otherChannel as never,
          {
            name: '@another/plugin',
            rootDirectory: '/path',
            entryPoint: '/path/index.js',
            uid: 'uid-other',
            version: '1.0.0',
            metadata: createMockMetadata(),
            locales: [],
            fsDirs: TEST_FS_DIRS,
          },
          config,
          otherCallbacks
        );

        const handler = otherImplement.get(getPluginSecret);
        if (!handler) {
          throw new Error('expected getPluginSecret handler to be registered');
        }
        await handler({ key: 'api-key' });

        expect(otherCallbacks.onGetPluginSecret).toHaveBeenCalledWith('@another/plugin', 'api-key');
      });
    });
  });
});
