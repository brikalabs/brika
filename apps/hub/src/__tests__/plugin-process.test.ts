/**
 * Tests for PluginProcess
 */

import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { PluginPackageSchema } from '@brika/schema';
import type { PluginHealth } from '@brika/shared';
import {
  PluginProcess,
  type PluginProcessCallbacks,
  type PluginProcessConfig,
} from '@/runtime/plugins/plugin-process';

describe('PluginProcess', () => {
  let process: PluginProcess;
  let mockChannel: {
    pid: number;
    call: ReturnType<typeof mock>;
    send: ReturnType<typeof mock>;
    on: ReturnType<typeof mock>;
    ping: ReturnType<typeof mock>;
    stop: ReturnType<typeof mock>;
    kill: ReturnType<typeof mock>;
  };
  let callbacks: PluginProcessCallbacks;
  let config: PluginProcessConfig;
  let channelHandlers: Map<unknown, (...args: unknown[]) => void>;

  const createMockMetadata = (): PluginPackageSchema => ({
    name: '@test/plugin',
    version: '1.0.0',
    description: 'Test plugin',
    author: 'Test Author',
    homepage: 'https://example.com',
    repository: 'https://github.com/test',
    icon: 'test-icon',
    keywords: ['test'],
    license: 'MIT',
    engines: { brika: '^0.1.0' },
    blocks: [{ id: 'test-block', category: 'trigger' as const }],
    sparks: [{ id: 'test-spark' }],
  });

  beforeEach(() => {
    channelHandlers = new Map();

    mockChannel = {
      pid: 12345,
      call: mock().mockResolvedValue({ ok: true }),
      send: mock(),
      on: mock((contract: unknown, handler: (...args: unknown[]) => void) => {
        channelHandlers.set(contract, handler);
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
      onBrickInstancePatch: mock(),
      onHeartbeatFailed: mock(),
      onDisconnect: mock(),
      onMetrics: mock(),
      onRoute: mock(),
      onUpdatePreference: mock(),
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
      },
      config,
      callbacks
    );
  });

  afterEach(() => {
    process.stop();
  });

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
  });

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
        process.pushInput('instance-1', 'input', { value: 42 });

        expect(mockChannel.send).toHaveBeenCalled();
      });

      test('does nothing when stopped', () => {
        process.stop();
        mockChannel.send.mockClear();

        process.pushInput('instance-1', 'input', { value: 42 });

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
        process.sendPreferences({ theme: 'dark' });

        expect(mockChannel.send).toHaveBeenCalled();
      });

      test('does nothing when stopped', () => {
        process.stop();
        mockChannel.send.mockClear();

        process.sendPreferences({ theme: 'dark' });

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
  });

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

    test('handles missing metadata fields', () => {
      const minimalProcess = new PluginProcess(
        mockChannel as never,
        {
          name: '@test/minimal',
          rootDirectory: '/path',
          entryPoint: '/path/index.js',
          uid: 'uid-456',
          version: '0.1.0',
          metadata: { name: '@test/minimal', version: '0.1.0' } as PluginPackageSchema,
          locales: [],
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

      minimalProcess.stop();
    });
  });
});
