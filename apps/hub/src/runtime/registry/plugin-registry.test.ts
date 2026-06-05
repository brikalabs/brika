/**
 * Tests for PluginRegistry
 */

import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdir, mkdtemp, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get, provide, stub, useTestBed } from '@brika/di/testing';
import { useBunMock } from '@brika/testing';
import { BunRunner, ConfigLoader, HubConfig } from '@/runtime/config';
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
      expect(updateCalls[0]?.cmd).toEqual([process.execPath, 'update']);
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
      expect(updateCalls[0]?.cmd).toEqual([process.execPath, 'update', '@test/plugin']);
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

    test('returns update info when dependencies exist', async () => {
      bun
        .fs({
          '/test/home/plugins/package.json': {
            dependencies: { '@test/plugin': '^1.0.0' },
          },
          '/test/home/plugins/node_modules/@test/plugin/package.json': {
            version: '1.0.0',
          },
        })
        .spawn({ exitCode: 0, stdout: '2.0.0\n' })
        .apply();

      const result = await registry.checkUpdates();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: '@test/plugin',
        currentVersion: '1.0.0',
        latestVersion: '2.0.0',
        updateAvailable: true,
      });
    });

    test('reports no update when versions match', async () => {
      bun
        .fs({
          '/test/home/plugins/package.json': {
            dependencies: { '@test/plugin': '^1.0.0' },
          },
          '/test/home/plugins/node_modules/@test/plugin/package.json': {
            version: '1.0.0',
          },
        })
        .spawn({ exitCode: 0, stdout: '1.0.0\n' })
        .apply();

      const result = await registry.checkUpdates();

      expect(result).toHaveLength(1);
      expect(result[0]?.updateAvailable).toBe(false);
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

// ─────────────────────────────────────────────────────────────────────────────
// Local/workspace plugin tests — uses real temp directories for fs operations
// (mkdir, symlink, readlink, unlink) to avoid mock.module pollution.
// ─────────────────────────────────────────────────────────────────────────────

describe('PluginRegistry — local plugins', () => {
  let tmpHome: string;
  let pluginsDir: string;
  let registry: PluginRegistry;
  let mockConfigLoader: {
    get: ReturnType<typeof mock>;
    load: ReturnType<typeof mock>;
    addPlugin: ReturnType<typeof mock>;
    removePlugin: ReturnType<typeof mock>;
    resolvePluginEntry: ReturnType<typeof mock>;
  };
  let spawnExitCode: number;

  beforeEach(async () => {
    spawnExitCode = 0;
    tmpHome = await realpath(await mkdtemp(join(tmpdir(), 'brika-registry-test-')));
    pluginsDir = join(tmpHome, 'plugins');
    await mkdir(join(pluginsDir, 'node_modules'), { recursive: true });
    // Create the initial plugins package.json
    await writeFile(
      join(pluginsDir, 'package.json'),
      JSON.stringify({ name: 'brika-plugins', private: true, dependencies: {} }, null, 2)
    );

    mockConfigLoader = {
      get: mock().mockReturnValue({ plugins: [] }),
      load: mock().mockResolvedValue({ plugins: [] }),
      addPlugin: mock().mockResolvedValue(undefined),
      removePlugin: mock().mockResolvedValue(undefined),
      resolvePluginEntry: mock().mockResolvedValue({ rootDirectory: '/dev/null' }),
    };

    stub(Logger);
    provide(HubConfig, { homeDir: tmpHome });
    provide(ConfigLoader, mockConfigLoader);
    // Provide a mock BunRunner that doesn't actually spawn processes
    provide(BunRunner, {
      bin: process.execPath,
      env: (extra?: Record<string, string | undefined>) => ({ ...process.env, ...extra }),
      spawn: mock((_args: string[], _opts?: unknown) => ({
        exited: Promise.resolve(spawnExitCode),
        pid: 99999,
        stdout: null,
        stderr: null,
        kill: () => {},
      })),
    } as unknown as BunRunner);
    provide(PluginManager, {
      load: mock().mockResolvedValue(undefined),
      remove: mock().mockResolvedValue(undefined),
      unload: mock().mockResolvedValue(undefined),
      list: mock().mockReturnValue([]),
    });

    registry = get(PluginRegistry);
  });

  afterEach(async () => {
    await rm(tmpHome, { recursive: true, force: true });
  });

  test('workspace install links local plugin, creates symlink and adds dependency', async () => {
    // Create a real plugin directory
    const pluginSrc = join(tmpHome, 'workspace-plugin');
    await mkdir(pluginSrc, { recursive: true });
    await writeFile(join(pluginSrc, 'package.json'), JSON.stringify({ name: '@test/ws-plugin' }));

    mockConfigLoader.resolvePluginEntry.mockResolvedValue({
      rootDirectory: pluginSrc,
    });

    const phases: OperationProgress['phase'][] = [];
    for await (const progress of registry.install('@test/ws-plugin', 'workspace:*')) {
      phases.push(progress.phase);
    }

    expect(phases).toContain('complete');
    expect(mockConfigLoader.addPlugin).toHaveBeenCalledWith('@test/ws-plugin', 'workspace:*');

    // Symlink should exist
    const linkTarget = await readlink(join(pluginsDir, 'node_modules', '@test/ws-plugin'));
    expect(linkTarget).toBe(pluginSrc);

    // package.json should have the dependency
    const pkg = await Bun.file(join(pluginsDir, 'package.json')).json();
    expect(pkg.dependencies['@test/ws-plugin']).toBe('workspace:*');
  });

  test('normalizes bare absolute path to file: specifier', async () => {
    const pluginSrc = join(tmpHome, 'abs-plugin');
    await mkdir(pluginSrc, { recursive: true });
    await writeFile(join(pluginSrc, 'package.json'), JSON.stringify({ name: '@test/abs' }));

    mockConfigLoader.resolvePluginEntry.mockResolvedValue({
      rootDirectory: pluginSrc,
    });

    const phases: OperationProgress['phase'][] = [];
    for await (const progress of registry.install('@test/abs', pluginSrc)) {
      phases.push(progress.phase);
    }

    expect(phases).toContain('complete');
    // normalizeVersion turns '/path' into 'file:/path'
    expect(mockConfigLoader.addPlugin).toHaveBeenCalledWith('@test/abs', `file:${pluginSrc}`);
  });

  test('workspace install yields error when no package.json found', async () => {
    const emptyDir = join(tmpHome, 'empty-plugin');
    await mkdir(emptyDir, { recursive: true });

    mockConfigLoader.resolvePluginEntry.mockResolvedValue({
      rootDirectory: emptyDir,
    });

    const phases: OperationProgress[] = [];
    for await (const progress of registry.install('@test/broken', 'workspace:*')) {
      phases.push(progress);
    }

    const errorProgress = phases.find((p) => p.phase === 'error');
    expect(errorProgress).toBeDefined();
    expect(errorProgress?.error).toContain('No package.json');
  });

  test('workspace install continues when dependency install returns non-zero', async () => {
    const pluginSrc = join(tmpHome, 'failing-deps');
    await mkdir(pluginSrc, { recursive: true });
    await writeFile(join(pluginSrc, 'package.json'), JSON.stringify({ name: '@test/failing' }));

    mockConfigLoader.resolvePluginEntry.mockResolvedValue({
      rootDirectory: pluginSrc,
    });
    // Non-zero exit code for bun install --frozen-lockfile
    spawnExitCode = 1;

    const phases: OperationProgress['phase'][] = [];
    for await (const progress of registry.install('@test/failing', 'workspace:*')) {
      phases.push(progress.phase);
    }

    expect(phases).toContain('complete');
  });

  test('re-linking updates symlink when target changes', async () => {
    const pluginSrcV1 = join(tmpHome, 'plugin-v1');
    const pluginSrcV2 = join(tmpHome, 'plugin-v2');
    await mkdir(pluginSrcV1, { recursive: true });
    await mkdir(pluginSrcV2, { recursive: true });
    await writeFile(join(pluginSrcV1, 'package.json'), JSON.stringify({ name: '@test/relink' }));
    await writeFile(join(pluginSrcV2, 'package.json'), JSON.stringify({ name: '@test/relink' }));

    // First link
    mockConfigLoader.resolvePluginEntry.mockResolvedValue({ rootDirectory: pluginSrcV1 });
    for await (const _ of registry.install('@test/relink', 'workspace:*')) {
      // consume
    }

    // Second link to different target
    mockConfigLoader.resolvePluginEntry.mockResolvedValue({ rootDirectory: pluginSrcV2 });
    for await (const _ of registry.install('@test/relink', 'workspace:*')) {
      // consume
    }

    const linkTarget = await readlink(join(pluginsDir, 'node_modules', '@test/relink'));
    expect(linkTarget).toBe(pluginSrcV2);
  });

  test('uninstall removes symlink for workspace plugin', async () => {
    // Create a symlink manually
    const pluginSrc = join(tmpHome, 'ws-to-remove');
    await mkdir(pluginSrc, { recursive: true });
    await writeFile(join(pluginSrc, 'package.json'), JSON.stringify({ name: '@test/ws-rm' }));

    const linkDir = join(pluginsDir, 'node_modules', '@test');
    await mkdir(linkDir, { recursive: true });
    await symlink(pluginSrc, join(linkDir, 'ws-rm'));

    // Update package.json with the dependency
    await writeFile(
      join(pluginsDir, 'package.json'),
      JSON.stringify({
        name: 'brika-plugins',
        private: true,
        dependencies: { '@test/ws-rm': 'workspace:*' },
      })
    );

    await registry.uninstall('@test/ws-rm');

    expect(mockConfigLoader.removePlugin).toHaveBeenCalledWith('@test/ws-rm');
    // Symlink should be removed
    await expect(readlink(join(linkDir, 'ws-rm'))).rejects.toThrow();
    // Dependency should be removed from package.json
    const pkg = await Bun.file(join(pluginsDir, 'package.json')).json();
    expect(pkg.dependencies['@test/ws-rm']).toBeUndefined();
  });

  test('syncToConfig links local plugin entries', async () => {
    const pluginSrc = join(tmpHome, 'sync-local');
    await mkdir(pluginSrc, { recursive: true });
    await writeFile(join(pluginSrc, 'package.json'), JSON.stringify({ name: '@test/sync' }));

    mockConfigLoader.resolvePluginEntry.mockResolvedValue({ rootDirectory: pluginSrc });

    await registry.syncToConfig([{ name: '@test/sync', version: 'workspace:*' }]);

    // Should have linked the plugin
    const linkTarget = await readlink(join(pluginsDir, 'node_modules', '@test/sync'));
    expect(linkTarget).toBe(pluginSrc);
  });

  test('syncToConfig handles errors during local plugin linking gracefully', async () => {
    mockConfigLoader.resolvePluginEntry.mockRejectedValue(new Error('Resolve failed'));

    // Should not throw
    await registry.syncToConfig([{ name: '@test/broken', version: 'workspace:*' }]);
  });
});
