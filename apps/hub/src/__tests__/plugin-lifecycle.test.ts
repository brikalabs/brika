/**
 * Tests for PluginLifecycle
 */

import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { get, provide, stub, useTestBed } from '@brika/di/testing';
import type { Plugin, PluginHealth } from '@brika/shared';
import { PluginManagerConfig } from '@/runtime/config';
import { EventSystem } from '@/runtime/events/event-system';
import { I18nService } from '@/runtime/i18n';
import { Logger } from '@/runtime/logs/log-router';
import { MetricsStore } from '@/runtime/metrics';
import { PluginConfigService } from '@/runtime/plugins/plugin-config';
import { PluginEventHandler } from '@/runtime/plugins/plugin-events';
import { PluginLifecycle } from '@/runtime/plugins/plugin-lifecycle';
import type { PluginProcess } from '@/runtime/plugins/plugin-process';
import { StateStore } from '@/runtime/state/state-store';

useTestBed({ autoStub: false });

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
  };
  let mockPluginConfig: {
    getConfig: ReturnType<typeof mock>;
    validate: ReturnType<typeof mock>;
  };
  let mockMetrics: {
    record: ReturnType<typeof mock>;
    clear: ReturnType<typeof mock>;
  };

  const createMockProcess = (name: string, uid: string): Partial<PluginProcess> => ({
    name,
    uid,
    version: '1.0.0',
    pid: 12345,
    startedAt: Date.now(),
    kill: mock(),
    stop: mock(),
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
    };
    mockPluginConfig = {
      getConfig: mock().mockReturnValue({}),
      validate: mock().mockReturnValue({ success: true }),
    };
    mockMetrics = {
      record: mock(),
      clear: mock(),
    };

    stub(Logger);
    provide(PluginManagerConfig, mockConfig);
    provide(StateStore, mockState);
    provide(EventSystem, mockEvents);
    provide(I18nService, mockI18n);
    provide(PluginEventHandler, mockEventHandler);
    provide(PluginConfigService, mockPluginConfig);
    provide(MetricsStore, mockMetrics);

    lifecycle = get(PluginLifecycle);
  });

  describe('Process Management', () => {
    test('getProcess returns undefined when no process exists', () => {
      const result = lifecycle.getProcess('@test/plugin');

      expect(result).toBeUndefined();
    });

    test('getProcessByName returns undefined when no process exists', () => {
      const result = lifecycle.getProcessByName('@test/plugin');

      expect(result).toBeUndefined();
    });

    test('hasProcessByName returns false when no process exists', () => {
      const result = lifecycle.hasProcessByName('@test/plugin');

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

  describe('getStatus', () => {
    test('returns stopped when no process and no restart pending', () => {
      mockState.get.mockReturnValue({ health: 'stopped' });

      const result = lifecycle.getStatus('@test/plugin');

      expect(result).toBe('stopped');
    });

    test('returns health from state when no process', () => {
      mockState.get.mockReturnValue({ health: 'crashed' });

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
          description: 'Test plugin',
          author: 'Test Author',
          homepage: 'https://example.com',
          repository: 'https://github.com/test',
          icon: 'test-icon',
          keywords: ['test'],
          license: 'MIT',
          engines: { brika: '^0.1.0' },
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
      expect(result.status).toBe('stopped');
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
        lastError: null,
        updatedAt: Date.now(),
        metadata: {
          name: '@test/plugin',
          version: '1.0.0',
          engines: { brika: '^0.1.0' },
        },
      };

      const result = lifecycle.fromStored(stored);

      expect(result.description).toBeNull();
      expect(result.author).toBeNull();
      expect(result.homepage).toBeNull();
      expect(result.keywords).toEqual([]);
      expect(result.blocks).toEqual([]);
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
  });
});
