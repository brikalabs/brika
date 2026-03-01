/**
 * Tests for PluginManager
 */

import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { get, provide, stub, useTestBed } from '@brika/di/testing';
import type { Plugin } from '@brika/plugin';
import { BlockRegistry } from '@/runtime/blocks';
import { EventSystem } from '@/runtime/events/event-system';
import { Logger } from '@/runtime/logs/log-router';
import { PluginEventHandler } from '@/runtime/plugins/plugin-events';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import type { PluginProcess } from '@/runtime/plugins/plugin-process';
import { StateStore } from '@/runtime/state/state-store';

useTestBed({
  autoStub: false,
});

describe('PluginManager', () => {
  let manager: PluginManager;
  let mockLifecycle: {
    getProcessByUid: ReturnType<typeof mock>;
    getProcessByName: ReturnType<typeof mock>;
    hasProcessByName: ReturnType<typeof mock>;
    listProcesses: ReturnType<typeof mock>;
    toPlugin: ReturnType<typeof mock>;
    fromStored: ReturnType<typeof mock>;
    load: ReturnType<typeof mock>;
    unload: ReturnType<typeof mock>;
    stopAll: ReturnType<typeof mock>;
    restoreEnabled: ReturnType<typeof mock>;
    cleanupStale: ReturnType<typeof mock>;
  };
  let mockState: {
    get: ReturnType<typeof mock>;
    getByUid: ReturnType<typeof mock>;
    getWithMetadata: ReturnType<typeof mock>;
    getByUidWithMetadata: ReturnType<typeof mock>;
    listInstalledWithMetadata: ReturnType<typeof mock>;
    setEnabled: ReturnType<typeof mock>;
    setHealth: ReturnType<typeof mock>;
  };
  let mockEvents: {
    dispatch: ReturnType<typeof mock>;
    race: ReturnType<typeof mock>;
  };
  let mockBlocks: {
    getProvider: ReturnType<typeof mock>;
  };
  let mockEventHandler: {
    setBlockEmitHandler: ReturnType<typeof mock>;
    clearBlockEmitHandler: ReturnType<typeof mock>;
    setBlockLogHandler: ReturnType<typeof mock>;
    clearBlockLogHandler: ReturnType<typeof mock>;
  };

  const createMockProcess = (name: string, uid: string): Partial<PluginProcess> => ({
    name,
    uid,
    version: '1.0.0',
    pid: 12345,
    kill: mock(),
    startBlock: mock().mockResolvedValue({
      ok: true,
    }),
    pushInput: mock(),
    stopBlockInstance: mock(),
  });

  const createMockPlugin = (name: string, uid: string) =>
    ({
      uid,
      name,
      version: '1.0.0',
      status: 'running',
      health: 'running',
      blocks: [],
    }) as unknown as Plugin;

  beforeEach(() => {
    mockLifecycle = {
      getProcessByUid: mock(),
      getProcessByName: mock(),
      hasProcessByName: mock(),
      listProcesses: mock().mockReturnValue([]),
      toPlugin: mock(),
      fromStored: mock(),
      load: mock().mockResolvedValue(undefined),
      unload: mock().mockResolvedValue(undefined),
      stopAll: mock().mockResolvedValue(undefined),
      restoreEnabled: mock().mockResolvedValue(undefined),
      cleanupStale: mock().mockResolvedValue(undefined),
    };
    mockState = {
      get: mock(),
      getByUid: mock(),
      getWithMetadata: mock(),
      getByUidWithMetadata: mock(),
      listInstalledWithMetadata: mock().mockReturnValue([]),
      setEnabled: mock().mockResolvedValue(undefined),
      setHealth: mock().mockResolvedValue(undefined),
    };
    mockEvents = {
      dispatch: mock().mockResolvedValue(undefined),
      race: mock().mockResolvedValue({
        type: 'plugin.loaded',
        payload: {
          uid: 'test-uid',
          name: '@test/plugin',
        },
      }),
    };
    mockBlocks = {
      getProvider: mock(),
    };
    mockEventHandler = {
      setBlockEmitHandler: mock(),
      clearBlockEmitHandler: mock(),
      setBlockLogHandler: mock(),
      clearBlockLogHandler: mock(),
    };

    stub(Logger);
    provide(PluginLifecycle, mockLifecycle);
    provide(StateStore, mockState);
    provide(EventSystem, mockEvents);
    provide(BlockRegistry, mockBlocks);
    provide(PluginEventHandler, mockEventHandler);

    manager = get(PluginManager);
  });

  describe('Query API', () => {
    describe('get', () => {
      test('returns plugin from running process', () => {
        const process = createMockProcess('@test/plugin', 'uid-123');
        const plugin = createMockPlugin('@test/plugin', 'uid-123');
        mockLifecycle.getProcessByUid.mockReturnValue(process);
        mockLifecycle.toPlugin.mockReturnValue(plugin);

        const result = manager.get('uid-123');

        expect(result).toEqual(plugin);
        expect(mockLifecycle.getProcessByUid).toHaveBeenCalledWith('uid-123');
      });

      test('returns plugin from stored state when not running', () => {
        const storedData = {
          name: '@test/plugin',
          uid: 'uid-123',
          rootDirectory: '/path',
        };
        const plugin = createMockPlugin('@test/plugin', 'uid-123');
        mockLifecycle.getProcessByUid.mockReturnValue(null);
        mockState.getByUidWithMetadata.mockReturnValue(storedData);
        mockLifecycle.fromStored.mockReturnValue(plugin);

        const result = manager.get('uid-123');

        expect(result).toEqual(plugin);
        expect(mockState.getByUidWithMetadata).toHaveBeenCalledWith('uid-123');
      });

      test('returns null when plugin not found', () => {
        mockLifecycle.getProcessByUid.mockReturnValue(null);
        mockState.getByUidWithMetadata.mockReturnValue(null);

        const result = manager.get('unknown-uid');

        expect(result).toBeNull();
      });
    });

    describe('getByName', () => {
      test('returns plugin from running process', () => {
        const process = createMockProcess('@test/plugin', 'uid-123');
        const plugin = createMockPlugin('@test/plugin', 'uid-123');
        mockLifecycle.getProcessByName.mockReturnValue(process);
        mockLifecycle.toPlugin.mockReturnValue(plugin);

        const result = manager.getByName('@test/plugin');

        expect(result).toEqual(plugin);
        expect(mockLifecycle.getProcessByName).toHaveBeenCalledWith('@test/plugin');
      });

      test('returns plugin from stored state when not running', () => {
        const storedData = {
          name: '@test/plugin',
          uid: 'uid-123',
          rootDirectory: '/path',
        };
        const plugin = createMockPlugin('@test/plugin', 'uid-123');
        mockLifecycle.getProcessByName.mockReturnValue(null);
        mockState.getWithMetadata.mockReturnValue(storedData);
        mockLifecycle.fromStored.mockReturnValue(plugin);

        const result = manager.getByName('@test/plugin');

        expect(result).toEqual(plugin);
        expect(mockState.getWithMetadata).toHaveBeenCalledWith('@test/plugin');
      });

      test('returns null when plugin not found', () => {
        mockLifecycle.getProcessByName.mockReturnValue(null);
        mockState.getWithMetadata.mockReturnValue(null);

        const result = manager.getByName('unknown-plugin');

        expect(result).toBeNull();
      });
    });

    describe('list', () => {
      test('returns combined list of running and stored plugins', () => {
        const process = createMockProcess('@test/running', 'uid-1');
        const runningPlugin = createMockPlugin('@test/running', 'uid-1');
        const storedData = {
          name: '@test/stored',
          uid: 'uid-2',
        };
        const storedPlugin = createMockPlugin('@test/stored', 'uid-2');

        mockLifecycle.listProcesses.mockReturnValue([
          process,
        ]);
        mockLifecycle.toPlugin.mockReturnValue(runningPlugin);
        mockState.listInstalledWithMetadata.mockReturnValue([
          storedData,
        ]);
        mockLifecycle.fromStored.mockReturnValue(storedPlugin);

        const result = manager.list();

        expect(result).toHaveLength(2);
        expect(result.map((p) => p.name).sort()).toEqual([
          '@test/running',
          '@test/stored',
        ]);
      });

      test('does not duplicate plugins that are both running and stored', () => {
        const process = createMockProcess('@test/plugin', 'uid-1');
        const plugin = createMockPlugin('@test/plugin', 'uid-1');
        const storedData = {
          name: '@test/plugin',
          uid: 'uid-1',
        };

        mockLifecycle.listProcesses.mockReturnValue([
          process,
        ]);
        mockLifecycle.toPlugin.mockReturnValue(plugin);
        mockState.listInstalledWithMetadata.mockReturnValue([
          storedData,
        ]);

        const result = manager.list();

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('@test/plugin');
      });

      test('returns empty list when no plugins', () => {
        mockLifecycle.listProcesses.mockReturnValue([]);
        mockState.listInstalledWithMetadata.mockReturnValue([]);

        const result = manager.list();

        expect(result).toHaveLength(0);
      });
    });

    describe('resolve', () => {
      test('returns uid from running process', () => {
        const process = createMockProcess('@test/plugin', 'uid-123');
        mockLifecycle.getProcessByName.mockReturnValue(process);

        const result = manager.resolve('@test/plugin');

        expect(result).toBe('uid-123');
      });

      test('returns uid from stored state when not running', () => {
        mockLifecycle.getProcessByName.mockReturnValue(null);
        mockState.get.mockReturnValue({
          uid: 'uid-456',
        });

        const result = manager.resolve('@test/plugin');

        expect(result).toBe('uid-456');
      });

      test('returns null when plugin not found', () => {
        mockLifecycle.getProcessByName.mockReturnValue(null);
        mockState.get.mockReturnValue(null);

        const result = manager.resolve('unknown');

        expect(result).toBeNull();
      });
    });
  });

  describe('Lifecycle Operations', () => {
    describe('enable', () => {
      test('enables a plugin and loads it', async () => {
        const storedData = {
          name: '@test/plugin',
          rootDirectory: '/path',
        };
        const process = createMockProcess('@test/plugin', 'uid-123');
        mockLifecycle.getProcessByUid.mockReturnValue(process);
        mockState.get.mockReturnValue(storedData);
        mockEvents.race.mockResolvedValue({
          type: 'plugin.loaded',
          payload: {
            uid: 'uid-123',
            name: '@test/plugin',
          },
        });

        await manager.enable('uid-123');

        expect(mockState.setEnabled).toHaveBeenCalledWith('@test/plugin', true);
        expect(mockLifecycle.load).toHaveBeenCalledWith('/path');
      });

      test('throws when plugin not found', async () => {
        mockLifecycle.getProcessByUid.mockReturnValue(null);
        mockState.getByUid.mockReturnValue(null);

        await expect(manager.enable('unknown-uid')).rejects.toThrow('Plugin not found');
      });

      test('throws on config invalid event', async () => {
        const storedData = {
          name: '@test/plugin',
          rootDirectory: '/path',
        };
        const process = createMockProcess('@test/plugin', 'uid-123');
        mockLifecycle.getProcessByUid.mockReturnValue(process);
        mockState.get.mockReturnValue(storedData);
        mockEvents.race.mockResolvedValue({
          type: 'plugin.configInvalid',
          payload: {
            uid: 'uid-123',
            errors: [
              'Invalid config',
            ],
          },
        });

        await expect(manager.enable('uid-123')).rejects.toThrow('invalid configuration');
      });
    });

    describe('disable', () => {
      test('disables a plugin and unloads it', async () => {
        const process = createMockProcess('@test/plugin', 'uid-123');
        mockLifecycle.getProcessByUid.mockReturnValue(process);

        await manager.disable('uid-123');

        expect(mockState.setEnabled).toHaveBeenCalledWith('@test/plugin', false);
        expect(mockLifecycle.unload).toHaveBeenCalledWith('@test/plugin');
      });

      test('throws when plugin not found', async () => {
        mockLifecycle.getProcessByUid.mockReturnValue(null);
        mockState.getByUid.mockReturnValue(null);

        await expect(manager.disable('unknown-uid')).rejects.toThrow('Plugin not found');
      });
    });

    describe('reload', () => {
      test('unloads and reloads a plugin', async () => {
        const process = createMockProcess('@test/plugin', 'uid-123');
        const storedData = {
          name: '@test/plugin',
          rootDirectory: '/path',
        };
        mockLifecycle.getProcessByUid.mockReturnValue(process);
        mockState.get.mockReturnValue(storedData);
        mockLifecycle.hasProcessByName
          .mockReturnValueOnce(false) // After unload
          .mockReturnValueOnce(true); // After load
        mockEvents.race.mockResolvedValue({
          type: 'plugin.loaded',
          payload: {
            uid: 'uid-123',
            name: '@test/plugin',
          },
        });

        await manager.reload('uid-123');

        expect(mockLifecycle.unload).toHaveBeenCalledWith('@test/plugin');
        expect(mockLifecycle.load).toHaveBeenCalledWith('/path');
        expect(mockEvents.dispatch).toHaveBeenCalled();
      });

      test('throws when plugin not found', async () => {
        mockLifecycle.getProcessByUid.mockReturnValue(null);
        mockState.getByUid.mockReturnValue(null);

        await expect(manager.reload('unknown-uid')).rejects.toThrow('Plugin not found');
      });

      test('throws when plugin still running after unload', async () => {
        const process = createMockProcess('@test/plugin', 'uid-123');
        mockLifecycle.getProcessByUid.mockReturnValue(process);
        mockLifecycle.hasProcessByName.mockReturnValue(true);

        await expect(manager.reload('uid-123')).rejects.toThrow('still running after unload');
      });

      test('throws when plugin fails to start', async () => {
        const process = createMockProcess('@test/plugin', 'uid-123');
        const storedData = {
          name: '@test/plugin',
          rootDirectory: '/path',
        };
        mockLifecycle.getProcessByUid.mockReturnValue(process);
        mockState.get.mockReturnValue(storedData);
        mockLifecycle.hasProcessByName.mockReturnValue(false); // Always false

        await expect(manager.reload('uid-123')).rejects.toThrow('failed to start');
      });
    });

    describe('kill', () => {
      test('kills a running plugin', async () => {
        const process = createMockProcess('@test/plugin', 'uid-123');
        mockLifecycle.getProcessByUid.mockReturnValue(process);
        mockLifecycle.getProcessByName.mockReturnValue(process);

        await manager.kill('uid-123');

        expect(process.kill).toHaveBeenCalledWith(9);
        expect(mockState.setHealth).toHaveBeenCalledWith(
          '@test/plugin',
          'crashed',
          expect.objectContaining({
            key: 'plugins:errors.killed',
          })
        );
        expect(mockLifecycle.unload).toHaveBeenCalledWith('@test/plugin');
      });

      test('does nothing when plugin not running', async () => {
        const process = createMockProcess('@test/plugin', 'uid-123');
        mockLifecycle.getProcessByUid.mockReturnValue(process);
        mockLifecycle.getProcessByName.mockReturnValue(null);

        await manager.kill('uid-123');

        expect(process.kill).not.toHaveBeenCalled();
      });
    });

    describe('load/unload/stopAll', () => {
      test('load delegates to lifecycle', async () => {
        await manager.load('/path/to/module', '@parent/plugin');

        expect(mockLifecycle.load).toHaveBeenCalledWith('/path/to/module', false, '@parent/plugin');
      });

      test('unload delegates to lifecycle', async () => {
        await manager.unload('@test/plugin', true);

        expect(mockLifecycle.unload).toHaveBeenCalledWith('@test/plugin', true);
      });

      test('stopAll delegates to lifecycle', async () => {
        await manager.stopAll();

        expect(mockLifecycle.stopAll).toHaveBeenCalled();
      });

      test('restoreEnabledFromState delegates to lifecycle', async () => {
        await manager.restoreEnabledFromState();

        expect(mockLifecycle.restoreEnabled).toHaveBeenCalled();
      });

      test('cleanupStaleState delegates to lifecycle', async () => {
        await manager.cleanupStaleState();

        expect(mockLifecycle.cleanupStale).toHaveBeenCalled();
      });
    });
  });

  describe('Reactive Block Operations', () => {
    test('setBlockEmitHandler delegates to event handler', () => {
      const handler = () => {
        /* noop test handler */
      };
      manager.setBlockEmitHandler(handler);

      expect(mockEventHandler.setBlockEmitHandler).toHaveBeenCalledWith(handler);
    });

    test('clearBlockEmitHandler delegates to event handler', () => {
      manager.clearBlockEmitHandler();

      expect(mockEventHandler.clearBlockEmitHandler).toHaveBeenCalled();
    });

    test('setBlockLogHandler delegates to event handler', () => {
      const handler = () => {
        /* noop test handler */
      };
      manager.setBlockLogHandler(handler);

      expect(mockEventHandler.setBlockLogHandler).toHaveBeenCalledWith(handler);
    });

    test('clearBlockLogHandler delegates to event handler', () => {
      manager.clearBlockLogHandler();

      expect(mockEventHandler.clearBlockLogHandler).toHaveBeenCalled();
    });

    describe('startBlock', () => {
      test('starts block on correct plugin', async () => {
        const process = createMockProcess('@test/plugin', 'uid-123');
        mockBlocks.getProvider.mockReturnValue('@test/plugin');
        mockLifecycle.getProcessByName.mockReturnValue(process);

        const result = await manager.startBlock('my-block', 'instance-1', 'workflow-1', {
          key: 'value',
        });

        expect(result.ok).toBe(true);
        expect(process.startBlock).toHaveBeenCalledWith('my-block', 'instance-1', 'workflow-1', {
          key: 'value',
        });
      });

      test('returns error for unknown block type', async () => {
        mockBlocks.getProvider.mockReturnValue(null);

        const result = await manager.startBlock('unknown', 'instance-1', 'workflow-1', {});

        expect(result.ok).toBe(false);
        expect(result.error).toContain('Unknown block type');
      });

      test('returns error when plugin not loaded', async () => {
        mockBlocks.getProvider.mockReturnValue('@test/plugin');
        mockLifecycle.getProcessByName.mockReturnValue(null);

        const result = await manager.startBlock('my-block', 'instance-1', 'workflow-1', {});

        expect(result.ok).toBe(false);
        expect(result.error).toContain('Plugin not loaded');
      });
    });

    describe('pushBlockInput', () => {
      test('broadcasts input to all processes', () => {
        const process1 = createMockProcess('@test/plugin1', 'uid-1');
        const process2 = createMockProcess('@test/plugin2', 'uid-2');
        mockLifecycle.listProcesses.mockReturnValue([
          process1,
          process2,
        ]);

        manager.pushBlockInput('instance-1', 'input', {
          value: 42,
        });

        expect(process1.pushInput).toHaveBeenCalledWith('instance-1', 'input', {
          value: 42,
        });
        expect(process2.pushInput).toHaveBeenCalledWith('instance-1', 'input', {
          value: 42,
        });
      });
    });

    describe('stopBlockInstance', () => {
      test('stops instance on all processes', () => {
        const process1 = createMockProcess('@test/plugin1', 'uid-1');
        const process2 = createMockProcess('@test/plugin2', 'uid-2');
        mockLifecycle.listProcesses.mockReturnValue([
          process1,
          process2,
        ]);

        manager.stopBlockInstance('instance-1');

        expect(process1.stopBlockInstance).toHaveBeenCalledWith('instance-1');
        expect(process2.stopBlockInstance).toHaveBeenCalledWith('instance-1');
      });
    });
  });
});
