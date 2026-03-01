/**
 * Tests for PluginRegistry
 */

import 'reflect-metadata';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { get, provide, stub, useTestBed } from '@brika/di/testing';
import { useBunMock } from '@brika/testing';
import { ConfigLoader, HubConfig } from '@/runtime/config';
import { Logger } from '@/runtime/logs/log-router';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { PluginRegistry } from '@/runtime/registry/plugin-registry';
import type { OperationProgress } from '@/runtime/registry/types';

useTestBed({
  autoStub: false,
});

describe('PluginRegistry', () => {
  const bun = useBunMock();

  let registry: PluginRegistry;
  let mockHubConfig: {
    homeDir: string;
  };
  let mockConfigLoader: {
    get: ReturnType<typeof mock>;
    load: ReturnType<typeof mock>;
    addPlugin: ReturnType<typeof mock>;
    removePlugin: ReturnType<typeof mock>;
    resolvePluginEntry: ReturnType<typeof mock>;
  };
  let mockPluginManager: {
    load: ReturnType<typeof mock>;
    unload: ReturnType<typeof mock>;
    list: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    mockHubConfig = {
      homeDir: '/test/home',
    };

    mockConfigLoader = {
      get: mock().mockReturnValue({
        plugins: [],
      }),
      load: mock().mockResolvedValue({
        plugins: [],
      }),
      addPlugin: mock().mockResolvedValue(undefined),
      removePlugin: mock().mockResolvedValue(undefined),
      resolvePluginEntry: mock().mockResolvedValue({
        rootDirectory: '/test/workspace/plugin',
      }),
    };

    mockPluginManager = {
      load: mock().mockResolvedValue(undefined),
      unload: mock().mockResolvedValue(undefined),
      list: mock().mockReturnValue([]),
    };

    bun.resolve('@test/existing', '/test/home/plugins/node_modules/@test/existing/index.js');

    stub(Logger);
    provide(HubConfig, mockHubConfig);
    provide(ConfigLoader, mockConfigLoader);
    provide(PluginManager, mockPluginManager);

    registry = get(PluginRegistry);
  });

  describe('init', () => {
    test('creates package.json when it does not exist', async () => {
      bun.apply();

      await registry.init();

      expect(bun.hasFile('/test/home/plugins/package.json')).toBe(true);
      expect(bun.getFile('/test/home/plugins/package.json')).toMatchObject({
        name: 'brika-plugins',
        private: true,
        dependencies: {},
      });
    });

    test('does not create package.json when it already exists', async () => {
      bun
        .file('/test/home/plugins/package.json', {
          name: 'existing',
          dependencies: {
            '@test/plugin': '1.0.0',
          },
        })
        .apply();

      await registry.init();

      expect(bun.getFile('/test/home/plugins/package.json')).toMatchObject({
        name: 'existing',
        dependencies: {
          '@test/plugin': '1.0.0',
        },
      });
    });
  });

  describe('install', () => {
    test('yields progress phases for npm install', async () => {
      bun
        .spawn({
          exitCode: 0,
          stderr: 'Resolving packages...\nDownloading @test/plugin...\nSaved lockfile',
        })
        .apply();

      const phases: OperationProgress['phase'][] = [];
      for await (const progress of registry.install('@test/plugin', '1.0.0')) {
        phases.push(progress.phase);
      }

      expect(phases).toContain('resolving');
      expect(phases).toContain('complete');
    });

    test('adds plugin to config after install', async () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();

      for await (const _ of registry.install('@test/plugin', '1.0.0')) {
        // Consume progress
      }

      expect(mockConfigLoader.addPlugin).toHaveBeenCalledWith('@test/plugin', '1.0.0');
    });

    test('uses latest version when not specified', async () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();

      for await (const _ of registry.install('@test/plugin')) {
        // Consume progress
      }

      expect(mockConfigLoader.addPlugin).toHaveBeenCalledWith('@test/plugin', 'latest');
    });

    test('skips npm install for workspace packages', async () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();
      mockConfigLoader.load.mockResolvedValue({
        plugins: [
          {
            name: '@test/workspace-plugin',
            version: 'workspace:*',
          },
        ],
      });

      for await (const _ of registry.install('@test/workspace-plugin', 'workspace:*')) {
        // Consume progress
      }

      const installCalls = bun.spawnCalls.filter((c) => c.cmd.includes('install'));
      expect(installCalls.length).toBe(0);
    });

    test('skips npm install for file packages', async () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();
      mockConfigLoader.load.mockResolvedValue({
        plugins: [
          {
            name: '@test/local-plugin',
            version: 'file:../local',
          },
        ],
      });

      for await (const _ of registry.install('@test/local-plugin', 'file:../local')) {
        // Consume progress
      }

      const installCalls = bun.spawnCalls.filter((c) => c.cmd.includes('install'));
      expect(installCalls.length).toBe(0);
    });

    test('yields error on failure', async () => {
      bun
        .spawn({
          exitCode: 1,
        })
        .apply();

      const phases: OperationProgress[] = [];
      for await (const progress of registry.install('@test/broken', '1.0.0')) {
        phases.push(progress);
      }

      const errorProgress = phases.find((p) => p.phase === 'error');
      expect(errorProgress).toBeDefined();
      expect(errorProgress?.error).toContain('exit code 1');
    });
  });

  describe('uninstall', () => {
    test('removes plugin from config', async () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();

      await registry.uninstall('@test/plugin');

      expect(mockConfigLoader.removePlugin).toHaveBeenCalledWith('@test/plugin');
    });

    test('runs bun remove when npm package exists', async () => {
      bun
        .file('/test/home/plugins/node_modules/@test/plugin/package.json', {
          name: '@test/plugin',
        })
        .spawn({
          exitCode: 0,
        })
        .apply();

      await registry.uninstall('@test/plugin');

      const removeCalls = bun.spawnCalls.filter((c) => c.cmd.includes('remove'));
      expect(removeCalls.length).toBe(1);
      expect(removeCalls[0]?.cmd).toContain('@test/plugin');
    });

    test('skips bun remove when npm package does not exist', async () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();

      await registry.uninstall('@test/workspace-plugin');

      const removeCalls = bun.spawnCalls.filter((c) => c.cmd.includes('remove'));
      expect(removeCalls.length).toBe(0);
    });
  });

  describe('list', () => {
    test('returns empty array when no plugins', async () => {
      bun.apply();

      const result = await registry.list();

      expect(result).toEqual([]);
    });

    test('returns npm packages from package.json', async () => {
      bun
        .fs({
          '/test/home/plugins/package.json': {
            dependencies: {
              '@test/plugin': '^1.0.0',
            },
          },
          '/test/home/plugins/node_modules/@test/plugin/package.json': {
            version: '1.2.3',
          },
        })
        .apply();

      const result = await registry.list();

      expect(result).toContainEqual({
        name: '@test/plugin',
        version: '1.2.3',
        path: '/test/home/plugins/node_modules/@test/plugin',
      });
    });

    test('includes workspace packages from config', async () => {
      bun.apply();
      mockConfigLoader.get.mockReturnValue({
        plugins: [
          {
            name: '@test/workspace',
            version: 'workspace:*',
          },
        ],
      });

      const result = await registry.list();

      expect(result).toContainEqual({
        name: '@test/workspace',
        version: 'workspace:*',
        path: 'workspace',
      });
    });

    test('includes file packages from config', async () => {
      bun.apply();
      mockConfigLoader.get.mockReturnValue({
        plugins: [
          {
            name: '@test/local',
            version: 'file:../local-plugin',
          },
        ],
      });

      const result = await registry.list();

      expect(result).toContainEqual({
        name: '@test/local',
        version: 'file:../local-plugin',
        path: 'file:../local-plugin',
      });
    });

    test('deduplicates packages that appear in both npm and config', async () => {
      bun
        .fs({
          '/test/home/plugins/package.json': {
            dependencies: {
              '@test/plugin': '^1.0.0',
            },
          },
          '/test/home/plugins/node_modules/@test/plugin/package.json': {
            version: '1.2.3',
          },
        })
        .apply();
      mockConfigLoader.get.mockReturnValue({
        plugins: [
          {
            name: '@test/plugin',
            version: '1.0.0',
          },
        ],
      });

      const result = await registry.list();

      const pluginEntries = result.filter((p) => p.name === '@test/plugin');
      expect(pluginEntries.length).toBe(1);
    });
  });

  describe('has', () => {
    test('returns true when plugin is installed', async () => {
      bun
        .fs({
          '/test/home/plugins/package.json': {
            dependencies: {
              '@test/plugin': '^1.0.0',
            },
          },
          '/test/home/plugins/node_modules/@test/plugin/package.json': {
            version: '1.0.0',
          },
        })
        .apply();

      const result = await registry.has('@test/plugin');

      expect(result).toBe(true);
    });

    test('returns false when plugin is not installed', async () => {
      bun.apply();

      const result = await registry.has('@test/nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('get', () => {
    test('returns package info when installed', async () => {
      bun
        .fs({
          '/test/home/plugins/package.json': {
            dependencies: {
              '@test/plugin': '^1.0.0',
            },
          },
          '/test/home/plugins/node_modules/@test/plugin/package.json': {
            version: '1.2.3',
          },
        })
        .apply();

      const result = await registry.get('@test/plugin');

      expect(result).toEqual({
        name: '@test/plugin',
        version: '1.2.3',
        path: '/test/home/plugins/node_modules/@test/plugin',
      });
    });

    test('returns null when not installed', async () => {
      bun.apply();

      const result = await registry.get('@test/nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('resolve', () => {
    test('returns resolved path for existing package', () => {
      bun.apply();

      const result = registry.resolve('@test/existing');

      expect(result).toBe('/test/home/plugins/node_modules/@test/existing/index.js');
    });

    test('returns null for non-existing package', () => {
      bun.apply();

      const result = registry.resolve('@test/nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    test('yields progress for update operation', async () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();

      const phases: OperationProgress[] = [];
      for await (const progress of registry.update('@test/plugin')) {
        phases.push(progress);
      }

      expect(phases.some((p) => p.phase === 'resolving')).toBe(true);
      expect(phases.some((p) => p.phase === 'complete')).toBe(true);
    });

    test('updates all packages when no name specified', async () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();

      const phases: OperationProgress[] = [];
      for await (const progress of registry.update()) {
        phases.push(progress);
      }

      expect(phases[0]?.package).toBe('all');
      const updateCalls = bun.spawnCalls.filter((c) => c.cmd.includes('update'));
      expect(updateCalls.length).toBe(1);
      expect(updateCalls[0]?.cmd).toEqual([
        process.execPath,
        'update',
      ]);
    });

    test('updates specific package when name specified', async () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();

      const phases: OperationProgress[] = [];
      for await (const progress of registry.update('@test/plugin')) {
        phases.push(progress);
      }

      const updateCalls = bun.spawnCalls.filter((c) => c.cmd.includes('update'));
      expect(updateCalls.length).toBe(1);
      expect(updateCalls[0]?.cmd).toEqual([
        process.execPath,
        'update',
        '@test/plugin',
      ]);
    });

    test('yields error on failure', async () => {
      bun
        .spawn({
          exitCode: 1,
        })
        .apply();

      const phases: OperationProgress[] = [];
      for await (const progress of registry.update('@test/plugin')) {
        phases.push(progress);
      }

      const errorProgress = phases.find((p) => p.phase === 'error');
      expect(errorProgress).toBeDefined();
    });
  });

  describe('checkUpdates', () => {
    test('returns empty array when no package.json', async () => {
      bun.apply();

      const result = await registry.checkUpdates();

      expect(result).toEqual([]);
    });
  });

  describe('syncToConfig', () => {
    test('uninstalls removed plugins', async () => {
      bun
        .fs({
          '/test/home/plugins/package.json': {
            dependencies: {
              '@test/old-plugin': '^1.0.0',
            },
          },
          '/test/home/plugins/node_modules/@test/old-plugin/package.json': {
            version: '1.0.0',
          },
        })
        .spawn({
          exitCode: 0,
        })
        .apply();

      await registry.syncToConfig([]);

      expect(mockConfigLoader.removePlugin).toHaveBeenCalledWith('@test/old-plugin');
    });

    test('installs missing plugins', async () => {
      bun
        .spawn({
          exitCode: 0,
        })
        .apply();

      await registry.syncToConfig([
        {
          name: '@test/new-plugin',
          version: '1.0.0',
        },
      ]);

      expect(mockConfigLoader.addPlugin).toHaveBeenCalledWith('@test/new-plugin', '1.0.0');
    });

    test('handles errors during uninstall gracefully', async () => {
      bun
        .fs({
          '/test/home/plugins/package.json': {
            dependencies: {
              '@test/broken': '^1.0.0',
            },
          },
          '/test/home/plugins/node_modules/@test/broken/package.json': {
            version: '1.0.0',
          },
        })
        .spawn({
          exitCode: 0,
        })
        .apply();

      mockConfigLoader.removePlugin.mockRejectedValueOnce(new Error('Failed'));

      await registry.syncToConfig([]);

      expect(mockConfigLoader.removePlugin).toHaveBeenCalledWith('@test/broken');
    });

    test('handles errors during install gracefully', async () => {
      bun
        .spawn({
          exitCode: 1,
        })
        .apply();

      await registry.syncToConfig([
        {
          name: '@test/broken',
          version: '1.0.0',
        },
      ]);
    });
  });

  describe('phase detection', () => {
    test('detects resolving phase from bun output', async () => {
      bun
        .spawn({
          exitCode: 0,
          stderr: 'resolving dependencies...',
        })
        .apply();

      const phases: OperationProgress[] = [];
      for await (const progress of registry.install('@test/plugin', '1.0.0')) {
        phases.push(progress);
      }

      expect(phases.filter((p) => p.phase === 'resolving').length).toBeGreaterThanOrEqual(1);
    });

    test('detects downloading phase from GET output', async () => {
      bun
        .spawn({
          exitCode: 0,
          stderr: 'GET https://registry.npmjs.org/@test/plugin',
        })
        .apply();

      const phases: OperationProgress[] = [];
      for await (const progress of registry.install('@test/plugin', '1.0.0')) {
        phases.push(progress);
      }

      expect(phases.some((p) => p.phase === 'downloading')).toBe(true);
    });

    test('detects linking phase from Saved output', async () => {
      bun
        .spawn({
          exitCode: 0,
          stderr: 'Saved lockfile',
        })
        .apply();

      const phases: OperationProgress[] = [];
      for await (const progress of registry.install('@test/plugin', '1.0.0')) {
        phases.push(progress);
      }

      expect(phases.some((p) => p.phase === 'linking')).toBe(true);
    });
  });
});
