/**
 * Tests for PluginLoader
 * Testing plugin loading and synchronization
 */
import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { get, stub, useTestBed } from '@brika/di/testing';
import { PluginLoader } from '@/runtime/bootstrap/plugin-loader';
import type { BrikaConfig } from '@/runtime/config';
import { ConfigLoader } from '@/runtime/config';
import { Logger } from '@/runtime/logs/log-router';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { PluginRegistry } from '@/runtime/registry';
import { StateStore } from '@/runtime/state/state-store';

useTestBed({
  autoStub: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const createMockConfig = (plugins: BrikaConfig['plugins'] = []): BrikaConfig => ({
  hub: {
    host: '0.0.0.0',
    port: 3001,
    plugins: {
      installDir: '/tmp',
      heartbeatInterval: 5000,
      heartbeatTimeout: 15000,
    },
  },
  plugins,
  rules: [],
  schedules: [],
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('PluginLoader', () => {
  let loader: PluginLoader;
  let stateInitMock: ReturnType<typeof mock>;
  let registryInitMock: ReturnType<typeof mock>;
  let syncToConfigMock: ReturnType<typeof mock>;
  let stateSyncMock: ReturnType<typeof mock>;
  let resolvePluginMock: ReturnType<typeof mock>;
  let pmLoadMock: ReturnType<typeof mock>;
  let pmStopAllMock: ReturnType<typeof mock>;

  beforeEach(() => {
    stateInitMock = mock().mockResolvedValue(undefined);
    registryInitMock = mock().mockResolvedValue(undefined);
    syncToConfigMock = mock().mockResolvedValue(undefined);
    stateSyncMock = mock().mockResolvedValue(undefined);
    resolvePluginMock = mock();
    pmLoadMock = mock().mockResolvedValue(undefined);
    pmStopAllMock = mock().mockResolvedValue(undefined);

    stub(Logger);
    stub(StateStore, {
      init: stateInitMock,
      syncToConfig: stateSyncMock,
    });
    stub(PluginRegistry, {
      init: registryInitMock,
      syncToConfig: syncToConfigMock,
    });
    stub(ConfigLoader, {
      resolvePluginEntry: resolvePluginMock,
    });
    stub(PluginManager, {
      load: pmLoadMock,
      stopAll: pmStopAllMock,
    });

    loader = get(PluginLoader);
  });

  test('has correct name', () => {
    expect(loader.name).toBe('plugins');
  });

  describe('init', () => {
    test('initializes state store', async () => {
      await loader.init();
      expect(stateInitMock).toHaveBeenCalled();
    });

    test('initializes plugin registry', async () => {
      await loader.init();
      expect(registryInitMock).toHaveBeenCalled();
    });

    test('initializes in correct order (state before registry)', async () => {
      const callOrder: string[] = [];

      stateInitMock.mockImplementation(() => {
        callOrder.push('state');
        return Promise.resolve();
      });
      registryInitMock.mockImplementation(() => {
        callOrder.push('registry');
        return Promise.resolve();
      });

      await loader.init();

      expect(callOrder).toEqual(['state', 'registry']);
    });
  });

  describe('load', () => {
    test('syncs registry to config', async () => {
      const plugins = [
        {
          name: '@test/plugin',
          version: '1.0.0',
        },
      ];
      const config = createMockConfig(plugins);

      resolvePluginMock.mockResolvedValue({
        rootDirectory: '/path/to/plugin',
      });

      await loader.load(config);

      expect(syncToConfigMock).toHaveBeenCalledWith(plugins);
    });

    test('syncs state to config with plugin names', async () => {
      const plugins = [
        {
          name: '@test/plugin-a',
          version: '1.0.0',
        },
        {
          name: '@test/plugin-b',
          version: '2.0.0',
        },
      ];
      const config = createMockConfig(plugins);

      resolvePluginMock.mockResolvedValue({
        rootDirectory: '/path/to/plugin',
      });

      await loader.load(config);

      expect(stateSyncMock).toHaveBeenCalledWith(new Set(['@test/plugin-a', '@test/plugin-b']));
    });

    test('loads each configured plugin', async () => {
      const plugins = [
        {
          name: '@test/plugin-a',
          version: '1.0.0',
        },
        {
          name: '@test/plugin-b',
          version: '2.0.0',
        },
      ];
      const config = createMockConfig(plugins);

      resolvePluginMock
        .mockResolvedValueOnce({
          rootDirectory: '/path/to/plugin-a',
        })
        .mockResolvedValueOnce({
          rootDirectory: '/path/to/plugin-b',
        });

      await loader.load(config);

      expect(pmLoadMock).toHaveBeenCalledTimes(2);
      expect(pmLoadMock).toHaveBeenCalledWith('/path/to/plugin-a');
      expect(pmLoadMock).toHaveBeenCalledWith('/path/to/plugin-b');
    });

    test('handles empty plugin list', async () => {
      const config = createMockConfig([]);

      await loader.load(config);

      expect(syncToConfigMock).toHaveBeenCalledWith([]);
      expect(stateSyncMock).toHaveBeenCalledWith(new Set());
      expect(pmLoadMock).not.toHaveBeenCalled();
    });

    test('continues loading other plugins when one fails', async () => {
      const plugins = [
        {
          name: '@test/plugin-a',
          version: '1.0.0',
        },
        {
          name: '@test/plugin-b',
          version: '2.0.0',
        },
      ];
      const config = createMockConfig(plugins);

      resolvePluginMock
        .mockRejectedValueOnce(new Error('Failed to resolve'))
        .mockResolvedValueOnce({
          rootDirectory: '/path/to/plugin-b',
        });

      await loader.load(config);

      // Should still try to load plugin-b
      expect(pmLoadMock).toHaveBeenCalledTimes(1);
      expect(pmLoadMock).toHaveBeenCalledWith('/path/to/plugin-b');
    });

    test('handles plugin load failure gracefully', async () => {
      const plugins = [
        {
          name: '@test/plugin',
          version: '1.0.0',
        },
      ];
      const config = createMockConfig(plugins);

      resolvePluginMock.mockResolvedValue({
        rootDirectory: '/path/to/plugin',
      });
      pmLoadMock.mockRejectedValue(new Error('Load failed'));

      // Should not throw
      await loader.load(config);
    });
  });

  describe('stop', () => {
    test('stops all plugins', async () => {
      await loader.stop();
      expect(pmStopAllMock).toHaveBeenCalled();
    });
  });
});
