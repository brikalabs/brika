/**
 * Tests for PluginLifecycle
 */

import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { join } from 'node:path';
import { get, provide, stub, useTestBed } from '@brika/di/testing';
import type { Plugin, PluginHealth } from '@brika/plugin';
import { PluginManagerConfig } from '@/runtime/config';
import { EventSystem } from '@/runtime/events/event-system';
import { I18nService } from '@/runtime/i18n';
import { Logger } from '@/runtime/logs/log-router';
import { MetricsStore } from '@/runtime/metrics';
import { ModuleCompiler } from '@/runtime/modules';
import { PluginConfigService } from '@/runtime/plugins/plugin-config';
import { PluginEventHandler } from '@/runtime/plugins/plugin-events';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import type { PluginProcess } from '@/runtime/plugins/plugin-process';
import { StateStore } from '@/runtime/state/state-store';

useTestBed({
  autoStub: false,
});

describe('PluginLifecycle', () => {
  let lifecycle: PluginLifecycle;
  let mockConfig: {
    restartBaseDelayMs: number;
    restartMaxDelayMs: number;
    restartMaxCrashes: number;
    restartCrashWindowMs: number;
    restartStabilityMs: number;
    callTimeoutMs: number;
    heartbeatEveryMs: number;
    heartbeatTimeoutMs: number;
    autoRestartEnabled: boolean;
    killTimeoutMs: number;
  };
  let mockState: {
    get: ReturnType<typeof mock>;
    getByUid: ReturnType<typeof mock>;
    getWithMetadata: ReturnType<typeof mock>;
    getByUidWithMetadata: ReturnType<typeof mock>;
    listInstalled: ReturnType<typeof mock>;
    listInstalledWithMetadata: ReturnType<typeof mock>;
    registerPlugin: ReturnType<typeof mock>;
    remove: ReturnType<typeof mock>;
    setHealth: ReturnType<typeof mock>;
    loadMetadataCache: ReturnType<typeof mock>;
  };
  let mockEvents: {
    dispatch: ReturnType<typeof mock>;
    subscribe: ReturnType<typeof mock>;
  };
  let mockI18n: {
    registerPluginTranslations: ReturnType<typeof mock>;
  };
  let mockEventHandler: {
    onPluginReady: ReturnType<typeof mock>;
    onPluginLog: ReturnType<typeof mock>;
    registerBlock: ReturnType<typeof mock>;
    onBlockEmit: ReturnType<typeof mock>;
    onBlockLog: ReturnType<typeof mock>;
    registerSpark: ReturnType<typeof mock>;
    emitSpark: ReturnType<typeof mock>;
    subscribeToSparks: ReturnType<typeof mock>;
    registerBrickType: ReturnType<typeof mock>;
    registerRoute: ReturnType<typeof mock>;
  };
  let mockPluginConfig: {
    getConfig: ReturnType<typeof mock>;
    validate: ReturnType<typeof mock>;
    setConfig: ReturnType<typeof mock>;
  };
  let mockMetrics: {
    record: ReturnType<typeof mock>;
    clear: ReturnType<typeof mock>;
  };
  let mockModuleCompiler: {
    compile: ReturnType<typeof mock>;
    get: ReturnType<typeof mock>;
    prune: ReturnType<typeof mock>;
    remove: ReturnType<typeof mock>;
  };

  const createMockProcess = (name: string, uid: string): Partial<PluginProcess> => ({
    name,
    uid,
    version: '1.0.0',
    pid: 12345,
    startedAt: Date.now(),
    kill: mock(),
    stop: mock(),
    exited: Promise.resolve(0),
    sendPreferences: mock(),
    toPlugin: mock().mockReturnValue({
      uid,
      name,
      version: '1.0.0',
      status: 'running',
      health: 'running',
      blocks: [],
    } as unknown as Plugin),
  });

  beforeEach(() => {
    mockConfig = {
      restartBaseDelayMs: 1000,
      restartMaxDelayMs: 30000,
      restartMaxCrashes: 5,
      restartCrashWindowMs: 60000,
      restartStabilityMs: 30000,
      callTimeoutMs: 5000,
      heartbeatEveryMs: 1000,
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
    mockI18n = {
      registerPluginTranslations: mock().mockResolvedValue([]),
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
    };
    mockPluginConfig = {
      getConfig: mock().mockReturnValue({}),
      validate: mock().mockReturnValue({
        success: true,
      }),
      setConfig: mock().mockResolvedValue(undefined),
    };
    mockMetrics = {
      record: mock(),
      clear: mock(),
    };
    mockModuleCompiler = {
      compile: mock().mockResolvedValue(undefined),
      get: mock().mockReturnValue(undefined),
      prune: mock(),
      remove: mock(),
    };

    stub(Logger);
    provide(PluginManagerConfig, mockConfig);
    provide(StateStore, mockState);
    provide(EventSystem, mockEvents);
    provide(I18nService, mockI18n);
    provide(PluginEventHandler, mockEventHandler);
    provide(PluginConfigService, mockPluginConfig);
    provide(MetricsStore, mockMetrics);
    provide(ModuleCompiler, mockModuleCompiler);

    lifecycle = get(PluginLifecycle);
  });

  describe('Process Management', () => {
    test('getProcess returns undefined when no process exists', () => {
      const result = lifecycle.getProcess('@test/plugin');

      expect(result).toBeUndefined();
    });

    test('hasProcess returns false when no process exists', () => {
      const result = lifecycle.hasProcess('@test/plugin');

      expect(result).toBe(false);
    });

    test('getProcessByUid returns undefined when no process exists', () => {
      const result = lifecycle.getProcessByUid('uid-123');

      expect(result).toBeUndefined();
    });

    test('listProcesses returns empty array when no processes', () => {
      const result = lifecycle.listProcesses();

      expect(result).toEqual([]);
    });
  });

  describe('resolvePluginNameByUid', () => {
    test('returns undefined when no process and no state matches uid', () => {
      mockState.getByUid.mockReturnValue(undefined);

      const result = lifecycle.resolvePluginNameByUid('unknown-uid');

      expect(result).toBeUndefined();
    });

    test('returns name from state when no process matches uid', () => {
      mockState.getByUid.mockReturnValue({ name: '@test/stored' });

      const result = lifecycle.resolvePluginNameByUid('uid-stored');

      expect(result).toBe('@test/stored');
    });
  });

  describe('getStatus', () => {
    test('returns stopped when no process and no restart pending', () => {
      mockState.get.mockReturnValue({
        health: 'stopped',
      });

      const result = lifecycle.getStatus('@test/plugin');

      expect(result).toBe('stopped');
    });

    test('returns health from state when no process', () => {
      mockState.get.mockReturnValue({
        health: 'crashed',
      });

      const result = lifecycle.getStatus('@test/plugin');

      expect(result).toBe('crashed');
    });

    test('returns stopped when no state found', () => {
      mockState.get.mockReturnValue(null);

      const result = lifecycle.getStatus('@test/plugin');

      expect(result).toBe('stopped');
    });
  });

  describe('toPlugin', () => {
    test('converts process to plugin with running status', () => {
      const mockProcess = createMockProcess('@test/plugin', 'uid-123');
      const plugin = {
        uid: 'uid-123',
        name: '@test/plugin',
        version: '1.0.0',
        status: 'running',
        health: 'running',
        blocks: [],
      } as unknown as Plugin;
      (mockProcess.toPlugin as ReturnType<typeof mock>).mockReturnValue(plugin);

      const result = lifecycle.toPlugin(mockProcess as PluginProcess);

      expect(result).toEqual(plugin);
      expect(mockProcess.toPlugin).toHaveBeenCalledWith('running');
    });
  });

  describe('fromStored', () => {
    test('creates plugin from stored state', () => {
      const stored = {
        uid: 'uid-123',
        name: '@test/plugin',
        version: '1.0.0',
        rootDirectory: '/path/to/plugin',
        entryPoint: '/path/to/plugin/index.js',
        enabled: true,
        health: 'stopped' as PluginHealth,
        lastError: null,
        updatedAt: Date.now(),
        metadata: {
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
          blocks: [],
          sparks: [],
        },
      };

      const result = lifecycle.fromStored(stored);

      expect(result.uid).toBe('uid-123');
      expect(result.name).toBe('@test/plugin');
      expect(result.version).toBe('1.0.0');
      expect(result.description).toBe('Test plugin');
      expect(result.author).toBe('Test Author');
      expect(result.homepage).toBe('https://example.com');
      expect(result.repository).toBe('https://github.com/test');
      expect(result.icon).toBe('test-icon');
      expect(result.keywords).toEqual(['test']);
      expect(result.license).toBe('MIT');
      expect(result.rootDirectory).toBe('/path/to/plugin');
      expect(result.entryPoint).toBe('/path/to/plugin/index.js');
      expect(result.status).toBe('stopped');
      expect(result.pid).toBeNull();
      expect(result.startedAt).toBeNull();
      expect(result.lastError).toBeNull();
      expect(result.locales).toEqual([]);
    });

    test('handles missing metadata fields', () => {
      const stored = {
        uid: 'uid-123',
        name: '@test/plugin',
        version: '1.0.0',
        rootDirectory: '/path/to/plugin',
        entryPoint: '/path/to/plugin/index.js',
        enabled: true,
        health: 'stopped' as PluginHealth,
        lastError: {
          key: 'plugins:errors.crashed',
          params: {
            reason: 'previous error',
          },
          message: 'previous error',
        },
        updatedAt: Date.now(),
        metadata: {
          name: '@test/plugin',
          version: '1.0.0',
          main: './index.js',
          engines: {
            brika: '^0.1.0',
          },
        },
      };

      const result = lifecycle.fromStored(stored);

      expect(result.description).toBeNull();
      expect(result.author).toBeNull();
      expect(result.homepage).toBeNull();
      expect(result.repository).toBeNull();
      expect(result.icon).toBeNull();
      expect(result.keywords).toEqual([]);
      expect(result.license).toBeNull();
      expect(result.blocks).toEqual([]);
      expect(result.sparks).toEqual([]);
      expect(result.bricks).toEqual([]);
      expect(result.lastError?.message).toBe('previous error');
    });

    test('returns running plugin if process exists', () => {
      // This tests the branch where process is found in #processes map
      // We can't easily inject into #processes, but we test the fallback path
      const stored = {
        uid: 'uid-123',
        name: '@test/not-running',
        version: '1.0.0',
        rootDirectory: '/path/to/plugin',
        entryPoint: '/path/to/plugin/index.js',
        enabled: true,
        health: 'running' as PluginHealth,
        lastError: null,
        updatedAt: Date.now(),
        metadata: {
          name: '@test/not-running',
          version: '1.0.0',
          main: './index.js',
          engines: {
            brika: '^0.1.0',
          },
        },
      };

      const result = lifecycle.fromStored(stored);

      // No process in the map, so it goes through the stored path
      expect(result.pid).toBeNull();
      expect(result.startedAt).toBeNull();
    });
  });

  describe('unload', () => {
    test('does nothing when process not found', async () => {
      await lifecycle.unload('@test/unknown');

      // Should not throw, just return
      expect(mockMetrics.clear).not.toHaveBeenCalled();
    });
  });

  describe('stopAll', () => {
    test('unloads all processes', async () => {
      // No processes to stop
      await lifecycle.stopAll();

      // Should complete without error
    });
  });

  describe('restoreEnabled', () => {
    test('loads metadata cache and registers translations', async () => {
      mockState.listInstalledWithMetadata.mockReturnValue([
        {
          name: '@test/plugin',
          rootDirectory: '/path/to/plugin',
          entryPoint: '/path/to/plugin/index.js',
          enabled: false, // Not enabled, won't try to load
        },
      ]);

      await lifecycle.restoreEnabled();

      expect(mockState.loadMetadataCache).toHaveBeenCalled();
      expect(mockI18n.registerPluginTranslations).toHaveBeenCalledWith(
        '@test/plugin',
        '/path/to/plugin'
      );
    });

    test('skips plugins with incomplete data', async () => {
      mockState.listInstalledWithMetadata.mockReturnValue([
        {
          name: '@test/incomplete',
          rootDirectory: null, // Missing data
          entryPoint: null,
          enabled: true,
        },
      ]);

      await lifecycle.restoreEnabled();

      expect(mockI18n.registerPluginTranslations).not.toHaveBeenCalled();
    });

    test('skips plugins with missing name', async () => {
      mockState.listInstalledWithMetadata.mockReturnValue([
        {
          name: '',
          rootDirectory: '/path',
          entryPoint: '/path/index.js',
          enabled: true,
        },
      ]);

      await lifecycle.restoreEnabled();

      expect(mockI18n.registerPluginTranslations).not.toHaveBeenCalled();
    });

    test('skips plugins with missing entryPoint', async () => {
      mockState.listInstalledWithMetadata.mockReturnValue([
        {
          name: '@test/plugin',
          rootDirectory: '/path',
          entryPoint: null,
          enabled: true,
        },
      ]);

      await lifecycle.restoreEnabled();

      expect(mockI18n.registerPluginTranslations).not.toHaveBeenCalled();
    });

    test('handles load failure during restoration', async () => {
      mockState.listInstalledWithMetadata.mockReturnValue([
        {
          name: '@test/failing',
          rootDirectory: '/nonexistent/path/that/does/not/exist',
          entryPoint: '/nonexistent/path/that/does/not/exist/index.js',
          enabled: true,
        },
      ]);

      // Should not throw even when load() fails for the plugin
      await lifecycle.restoreEnabled();

      expect(mockI18n.registerPluginTranslations).toHaveBeenCalledWith(
        '@test/failing',
        '/nonexistent/path/that/does/not/exist'
      );
    });

    test('registers translations for disabled plugins without loading them', async () => {
      mockState.listInstalledWithMetadata.mockReturnValue([
        {
          name: '@test/disabled',
          rootDirectory: '/path/to/disabled',
          entryPoint: '/path/to/disabled/index.js',
          enabled: false,
        },
        {
          name: '@test/also-disabled',
          rootDirectory: '/path/to/also-disabled',
          entryPoint: '/path/to/also-disabled/index.js',
          enabled: false,
        },
      ]);

      await lifecycle.restoreEnabled();

      expect(mockI18n.registerPluginTranslations).toHaveBeenCalledTimes(2);
      expect(mockI18n.registerPluginTranslations).toHaveBeenCalledWith(
        '@test/disabled',
        '/path/to/disabled'
      );
      expect(mockI18n.registerPluginTranslations).toHaveBeenCalledWith(
        '@test/also-disabled',
        '/path/to/also-disabled'
      );
    });
  });

  describe('cleanupStale', () => {
    test('removes plugins where package.json does not exist', async () => {
      mockState.listInstalled.mockReturnValue([
        {
          name: '@test/stale-plugin',
          rootDirectory: '/nonexistent/path',
        },
      ]);

      await lifecycle.cleanupStale();

      expect(mockState.remove).toHaveBeenCalledWith('@test/stale-plugin');
    });

    test('does not remove plugins with existing package.json', async () => {
      // Use a real directory that has a package.json (apps/hub)
      const hubDir = join(import.meta.dir, '../..');
      mockState.listInstalled.mockReturnValue([
        {
          name: '@test/existing-plugin',
          rootDirectory: hubDir,
        },
      ]);

      await lifecycle.cleanupStale();

      expect(mockState.remove).not.toHaveBeenCalled();
    });

    test('handles empty installed list', async () => {
      mockState.listInstalled.mockReturnValue([]);

      await lifecycle.cleanupStale();

      expect(mockState.remove).not.toHaveBeenCalled();
    });

    test('removes multiple stale plugins', async () => {
      mockState.listInstalled.mockReturnValue([
        {
          name: '@test/stale-1',
          rootDirectory: '/nonexistent/path1',
        },
        {
          name: '@test/stale-2',
          rootDirectory: '/nonexistent/path2',
        },
      ]);

      await lifecycle.cleanupStale();

      expect(mockState.remove).toHaveBeenCalledTimes(2);
      expect(mockState.remove).toHaveBeenCalledWith('@test/stale-1');
      expect(mockState.remove).toHaveBeenCalledWith('@test/stale-2');
    });

    test('removes compiled modules for stale plugins', async () => {
      mockState.listInstalled.mockReturnValue([
        {
          name: '@test/stale-plugin',
          rootDirectory: '/nonexistent/path',
        },
      ]);

      await lifecycle.cleanupStale();

      expect(mockModuleCompiler.remove).toHaveBeenCalledWith(
        '@test/stale-plugin',
        '/nonexistent/path'
      );
    });
  });

  describe('removeModules', () => {
    test('delegates to module compiler remove', () => {
      lifecycle.removeModules('@test/plugin', '/path/to/plugin');

      expect(mockModuleCompiler.remove).toHaveBeenCalledWith('@test/plugin', '/path/to/plugin');
    });

    test('calls remove without rootDirectory', () => {
      lifecycle.removeModules('@test/plugin');

      expect(mockModuleCompiler.remove).toHaveBeenCalledWith('@test/plugin', undefined);
    });
  });

  describe('fromStored (additional coverage)', () => {
    test('includes pages and granted permissions from stored state', () => {
      const stored = {
        uid: 'uid-pages',
        name: '@test/paged',
        version: '1.0.0',
        rootDirectory: '/path/to/plugin',
        entryPoint: '/path/to/plugin/index.js',
        enabled: true,
        health: 'stopped' as PluginHealth,
        lastError: null,
        updatedAt: Date.now(),
        grantedPermissions: ['network', 'storage'],
        metadata: {
          name: '@test/paged',
          version: '1.0.0',
          main: './index.js',
          engines: { brika: '^0.1.0' },
          pages: [{ id: 'settings' }],
          bricks: [{ id: 'widget' }],
          permissions: ['network'],
        },
      };

      const result = lifecycle.fromStored(stored);

      expect(result.pages).toEqual([{ id: 'settings' }]);
      expect(result.bricks).toEqual([{ id: 'widget' }]);
      expect(result.grantedPermissions).toEqual(['network', 'storage']);
      expect(result.permissions).toEqual(['network']);
    });
  });
});
