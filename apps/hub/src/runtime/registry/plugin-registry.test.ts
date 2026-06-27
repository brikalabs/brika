/**
 * Tests for PluginRegistry
 */

import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get, provide, stub, useTestBed } from '@brika/di/testing';
import { BrikaError } from '@brika/errors';
import { useBunMock } from '@brika/testing';
import { BunRunner, ConfigLoader, HubConfig } from '@/runtime/config';
import { Logger } from '@/runtime/logs/log-router';
import { PluginManager } from '@/runtime/plugins/plugin-manager';
import { PluginRegistry } from '@/runtime/registry/plugin-registry';
import type { OperationProgress } from '@/runtime/registry/types';
import { StateStore } from '@/runtime/state/state-store';

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
    setNpmRegistry: ReturnType<typeof mock>;
    resolvePluginEntry: ReturnType<typeof mock>;
  };
  let mockPluginManager: {
    load: ReturnType<typeof mock>;
    unload: ReturnType<typeof mock>;
    list: ReturnType<typeof mock>;
  };
  let mockStateGet: ReturnType<typeof mock>;

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
        npmRegistries: { '@brika': 'https://registry.brika.dev' },
      }),
      addPlugin: mock().mockResolvedValue(undefined),
      removePlugin: mock().mockResolvedValue(undefined),
      setNpmRegistry: mock().mockResolvedValue(undefined),
      resolvePluginEntry: mock().mockResolvedValue({
        rootDirectory: '/test/workspace/plugin',
      }),
    };

    mockPluginManager = {
      load: mock().mockResolvedValue(undefined),
      unload: mock().mockResolvedValue(undefined),
      list: mock().mockReturnValue([]),
    };

    bun.resolve(
      '@test/existing',
      '/test/home/.system/plugins/node_modules/@test/existing/index.js'
    );

    stub(Logger);
    provide(HubConfig, mockHubConfig);
    provide(ConfigLoader, mockConfigLoader);
    provide(PluginManager, mockPluginManager);
    // No state row by default: installs report a plain success, not "dormant".
    mockStateGet = mock().mockReturnValue(undefined);
    provide(StateStore, { get: mockStateGet });

    registry = get(PluginRegistry);
  });

  describe('init', () => {
    test('creates package.json when it does not exist', async () => {
      bun.apply();

      await registry.init();

      expect(bun.hasFile('/test/home/.system/plugins/package.json')).toBe(true);
      expect(bun.getFile('/test/home/.system/plugins/package.json')).toMatchObject({
        name: 'brika-plugins',
        private: true,
        dependencies: {},
      });
    });

    test('writes a scoped .npmrc from the configured registries', async () => {
      bun.apply();

      await registry.init();

      expect(bun.hasFile('/test/home/.system/plugins/.npmrc')).toBe(true);
      expect(String(bun.getFile('/test/home/.system/plugins/.npmrc'))).toContain(
        '@brika:registry=https://registry.brika.dev'
      );
    });

    test('does not create package.json when it already exists', async () => {
      bun
        .file('/test/home/.system/plugins/package.json', {
          name: 'existing',
          dependencies: {
            '@test/plugin': '1.0.0',
          },
        })
        .apply();

      await registry.init();

      expect(bun.getFile('/test/home/.system/plugins/package.json')).toMatchObject({
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

    test('reports a dormant (consent-pending) install in the complete message', async () => {
      bun.spawn({ exitCode: 0 }).apply();
      // After load, the plugin is registered dormant (a grant-requesting remote
      // plugin under consent-before-code).
      mockStateGet.mockReturnValue({ enabled: false });

      const events: OperationProgress[] = [];
      for await (const progress of registry.install('@test/plugin', '1.0.0')) {
        events.push(progress);
      }

      const complete = events.find((p) => p.phase === 'complete');
      expect(complete?.message).toContain('disabled');
      expect(complete?.message).toContain('enable');
    });

    test('installs a registry plugin by its tarball (deps stay on npm, no scope routing)', async () => {
      bun.spawn({ exitCode: 0 }).apply();
      // The registry serves an npm packument carrying the tarball URL.
      bun.fetch(
        async () =>
          new Response(
            JSON.stringify({
              'dist-tags': { latest: '1.0.0' },
              versions: {
                '1.0.0': {
                  dist: { tarball: 'https://registry.brika.dev/@myscope/tada/-/tada-1.0.0.tgz' },
                },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
      );
      mockConfigLoader.load.mockResolvedValue({
        plugins: [],
        defaultRegistry: 'https://registry.brika.dev',
        npmRegistries: {},
      });

      const events: OperationProgress[] = [];
      for await (const progress of registry.install('@myscope/tada', '1.0.0')) {
        events.push(progress);
      }

      // The plugin is installed from a verified LOCAL tarball (downloaded from the registry, then
      // installed by `file:`), never directly from the URL, so the bytes can't be swapped under bun.
      expect(
        bun.spawnCalls.some((c) =>
          c.cmd.some((arg) => arg.includes('@file:') && arg.includes('tada-1.0.0.tgz'))
        )
      ).toBe(true);
      // …the stream surfaces the registry it came from…
      expect(
        events.some((e) => e.message?.includes('Downloading from registry.brika.dev') === true)
      ).toBe(true);
      // …and no scope is routed to the registry, so dependencies resolve from public npm.
      expect(mockConfigLoader.setNpmRegistry).not.toHaveBeenCalled();
    });

    test('falls back to a plain npm install when the registry does not host the plugin', async () => {
      bun.spawn({ exitCode: 0 }).apply();
      bun.fetch(async () => new Response(null, { status: 404 }));
      mockConfigLoader.load.mockResolvedValue({
        plugins: [],
        defaultRegistry: 'https://registry.brika.dev',
        npmRegistries: {},
      });

      const events: OperationProgress[] = [];
      for await (const progress of registry.install('@myscope/tada', '1.0.0')) {
        events.push(progress);
      }

      // No tarball resolved → bun installs by name@version, still with no scope routing.
      expect(bun.spawnCalls.some((c) => c.cmd.includes('@myscope/tada@1.0.0'))).toBe(true);
      // The fallback source is reported as npm.
      expect(events.some((e) => e.message?.includes('Downloading from npm') === true)).toBe(true);
      expect(mockConfigLoader.setNpmRegistry).not.toHaveBeenCalled();
    });

    test('resolves a semver range to the greatest hosted version (not the latest tag)', async () => {
      bun
        .spawn({ exitCode: 0 })
        .file('/test/home/.system/plugins/node_modules/@myscope/tada/package.json', {
          version: '1.5.0',
        })
        .apply();
      bun.fetch(
        async () =>
          new Response(
            JSON.stringify({
              'dist-tags': { latest: '2.0.0' },
              versions: {
                '1.0.0': { dist: { tarball: 'https://r.brika.dev/tada-1.0.0.tgz' } },
                '1.5.0': { dist: { tarball: 'https://r.brika.dev/tada-1.5.0.tgz' } },
                '2.0.0': { dist: { tarball: 'https://r.brika.dev/tada-2.0.0.tgz' } },
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
      );
      mockConfigLoader.load.mockResolvedValue({
        plugins: [],
        defaultRegistry: 'https://r.brika.dev',
        npmRegistries: {},
      });

      for await (const _ of registry.install('@myscope/tada', '^1.0.0')) {
        // consume
      }

      // ^1.0.0 resolves to 1.5.0 (the greatest match), NOT the 2.0.0 latest tag.
      expect(bun.spawnCalls.some((c) => c.cmd.some((a) => a.includes('tada-1.5.0.tgz')))).toBe(
        true
      );
      expect(bun.spawnCalls.some((c) => c.cmd.some((a) => a.includes('tada-2.0.0.tgz')))).toBe(
        false
      );
      // brika.yml records the concrete resolved version, not the requested range.
      expect(mockConfigLoader.addPlugin).toHaveBeenCalledWith('@myscope/tada', '1.5.0');
    });

    test('falls back to npm for an exact version the registry does not host (no silent latest)', async () => {
      bun.spawn({ exitCode: 0 }).apply();
      bun.fetch(
        async () =>
          new Response(
            JSON.stringify({
              'dist-tags': { latest: '1.0.0' },
              versions: { '1.0.0': { dist: { tarball: 'https://r.brika.dev/tada-1.0.0.tgz' } } },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
      );
      mockConfigLoader.load.mockResolvedValue({
        plugins: [],
        defaultRegistry: 'https://r.brika.dev',
        npmRegistries: {},
      });

      const events: OperationProgress[] = [];
      for await (const progress of registry.install('@myscope/tada', '9.9.9')) {
        events.push(progress);
      }

      // The registry hosts only 1.0.0; requesting 9.9.9 must NOT silently install 1.0.0/latest from it…
      expect(bun.spawnCalls.some((c) => c.cmd.some((a) => a.includes('.tgz')))).toBe(false);
      // …it falls back to a plain npm install by the exact spec (the pin may exist on npm).
      expect(bun.spawnCalls.some((c) => c.cmd.includes('@myscope/tada@9.9.9'))).toBe(true);
      expect(events.some((e) => e.message?.includes('Downloading from npm') === true)).toBe(true);
    });

    test('verifies the tarball against dist.integrity and installs the verified bytes', async () => {
      const tarballUrl = 'https://r.brika.dev/@myscope/tada/-/tada-1.0.0.tgz';
      const bytes = new Uint8Array([10, 20, 30, 40, 50]);
      const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
      bun.spawn({ exitCode: 0 }).apply();
      bun.fetch(async (input) => {
        const url = `${input}`;
        if (url === tarballUrl) {
          return new Response(bytes);
        }
        return new Response(
          JSON.stringify({
            'dist-tags': { latest: '1.0.0' },
            versions: { '1.0.0': { dist: { tarball: tarballUrl, integrity } } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      });
      mockConfigLoader.load.mockResolvedValue({
        plugins: [],
        defaultRegistry: 'https://r.brika.dev',
        npmRegistries: {},
      });

      const events: OperationProgress[] = [];
      for await (const progress of registry.install('@myscope/tada', '1.0.0')) {
        events.push(progress);
      }

      expect(events.some((e) => e.phase === 'error')).toBe(false);
      expect(events.some((e) => e.phase === 'complete')).toBe(true);
      expect(
        bun.spawnCalls.some((c) =>
          c.cmd.some((a) => a.includes('@file:') && a.includes('tada-1.0.0.tgz'))
        )
      ).toBe(true);
    });

    test('rejects a tarball whose bytes do not match dist.integrity', async () => {
      const tarballUrl = 'https://r.brika.dev/@myscope/tada/-/tada-1.0.0.tgz';
      bun.spawn({ exitCode: 0 }).apply();
      bun.fetch(async (input) => {
        const url = `${input}`;
        if (url === tarballUrl) {
          return new Response(new Uint8Array([9, 9, 9])); // not what the integrity hash covers
        }
        return new Response(
          JSON.stringify({
            'dist-tags': { latest: '1.0.0' },
            versions: {
              '1.0.0': { dist: { tarball: tarballUrl, integrity: 'sha512-Zm9vYmFy' } },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      });
      mockConfigLoader.load.mockResolvedValue({
        plugins: [],
        defaultRegistry: 'https://r.brika.dev',
        npmRegistries: {},
      });

      const events: OperationProgress[] = [];
      for await (const progress of registry.install('@myscope/tada', '1.0.0')) {
        events.push(progress);
      }

      // A hash mismatch aborts the install before the plugin is ever installed by file:.
      expect(events.some((e) => e.phase === 'error')).toBe(true);
      expect(bun.spawnCalls.some((c) => c.cmd.some((a) => a.includes('@file:')))).toBe(false);
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

    test('forces the reload so an already-loaded plugin recompiles (and shows its build) on install', async () => {
      bun.spawn({ exitCode: 0 }).apply();

      for await (const _ of registry.install('@test/plugin', '1.0.0')) {
        // Consume progress
      }

      const call = mockPluginManager.load.mock.calls.find((c) => c[0] === '@test/plugin');
      expect(call?.[2]).toMatchObject({ force: true });
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
      expect(installCalls).toHaveLength(0);
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
      expect(installCalls).toHaveLength(0);
    });

    test('yields error on failure', async () => {
      bun
        .spawn({
          exitCode: 1,
        })
        .apply();
      // Online: the connectivity probe resolves, so the raw failure is kept.
      bun.fetch(async () => new Response(null, { status: 200 }));

      const phases: OperationProgress[] = [];
      for await (const progress of registry.install('@test/broken', '1.0.0')) {
        phases.push(progress);
      }

      const errorProgress = phases.find((p) => p.phase === 'error');
      expect(errorProgress).toBeDefined();
      expect(errorProgress?.error).toContain('exit code 1');
      // Plain Error: no structured code/detail, only the string message.
      expect(errorProgress?.errorCode).toBeUndefined();
      expect(errorProgress?.errorDetail).toBeUndefined();
    });

    test('reclassifies an npm install failure as offline when the registry is unreachable', async () => {
      bun.spawn({ exitCode: 1 }).apply();
      // The connectivity probe fails with a DNS error -> offline.
      bun.fetch(async () => {
        throw Object.assign(new Error('getaddrinfo ENOTFOUND registry.npmjs.org'), {
          code: 'ENOTFOUND',
        });
      });

      const events: OperationProgress[] = [];
      for await (const progress of registry.install('@test/remote', '1.0.0')) {
        events.push(progress);
      }

      const errorProgress = events.find((p) => p.phase === 'error');
      expect(errorProgress?.errorCode).toBe('UNAVAILABLE');
      expect(errorProgress?.error).toContain('offline');
      expect(errorProgress?.error).toContain('brika install <path>');
    });

    test('surfaces errorCode + errorDetail when the failure is a typed BrikaError', async () => {
      bun.spawn({ exitCode: 0 }).apply();
      mockPluginManager.load.mockRejectedValue(
        new BrikaError('MANIFEST_MISSING_MAIN', 'plugin has no entry point', {
          data: { manifestPath: '/x/package.json' },
        })
      );

      const events: OperationProgress[] = [];
      for await (const progress of registry.install('@test/plugin', '1.0.0')) {
        events.push(progress);
      }

      const errorProgress = events.find((p) => p.phase === 'error');
      expect(errorProgress?.error).toBe('plugin has no entry point');
      expect(errorProgress?.errorCode).toBe('MANIFEST_MISSING_MAIN');
      expect(errorProgress?.errorDetail?.code).toBe('MANIFEST_MISSING_MAIN');
      expect(errorProgress?.errorDetail?._brikaError).toBe(true);
      // brika.yml is written only after a successful load, so a load failure
      // never records the plugin in config (no config/filesystem split).
      expect(mockConfigLoader.addPlugin).not.toHaveBeenCalled();
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
        .file('/test/home/.system/plugins/node_modules/@test/plugin/package.json', {
          name: '@test/plugin',
        })
        .spawn({
          exitCode: 0,
        })
        .apply();

      await registry.uninstall('@test/plugin');

      const removeCalls = bun.spawnCalls.filter((c) => c.cmd.includes('remove'));
      expect(removeCalls).toHaveLength(1);
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
      expect(removeCalls).toHaveLength(0);
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
          '/test/home/.system/plugins/package.json': {
            dependencies: {
              '@test/plugin': '^1.0.0',
            },
          },
          '/test/home/.system/plugins/node_modules/@test/plugin/package.json': {
            version: '1.2.3',
          },
        })
        .apply();

      const result = await registry.list();

      expect(result).toContainEqual({
        name: '@test/plugin',
        version: '1.2.3',
        path: '/test/home/.system/plugins/node_modules/@test/plugin',
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
          '/test/home/.system/plugins/package.json': {
            dependencies: {
              '@test/plugin': '^1.0.0',
            },
          },
          '/test/home/.system/plugins/node_modules/@test/plugin/package.json': {
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
      expect(pluginEntries).toHaveLength(1);
    });
  });

  describe('has', () => {
    test('returns true when plugin is installed', async () => {
      bun
        .fs({
          '/test/home/.system/plugins/package.json': {
            dependencies: {
              '@test/plugin': '^1.0.0',
            },
          },
          '/test/home/.system/plugins/node_modules/@test/plugin/package.json': {
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
          '/test/home/.system/plugins/package.json': {
            dependencies: {
              '@test/plugin': '^1.0.0',
            },
          },
          '/test/home/.system/plugins/node_modules/@test/plugin/package.json': {
            version: '1.2.3',
          },
        })
        .apply();

      const result = await registry.get('@test/plugin');

      expect(result).toEqual({
        name: '@test/plugin',
        version: '1.2.3',
        path: '/test/home/.system/plugins/node_modules/@test/plugin',
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

      expect(result).toBe('/test/home/.system/plugins/node_modules/@test/existing/index.js');
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
      // An update carries no target version, so no message should read "…@undefined".
      expect(phases.some((p) => p.message?.includes('undefined') === true)).toBe(false);
      const resolving = phases.find((p) => p.phase === 'resolving');
      expect(resolving?.message).toBe('resolving @test/plugin');
    });

    test('re-resolves a registry plugin from the registry on update (bun cannot bump a pinned tarball)', async () => {
      const tarballUrl = 'https://registry.brika.dev/@test/plugin/-/plugin-2.0.0.tgz';
      bun
        .spawn({ exitCode: 0 })
        .file('/test/home/.system/plugins/package.json', {
          name: 'brika-plugins',
          dependencies: {
            // A registry install records a pinned tarball URL spec, which `bun update` cannot bump.
            '@test/plugin': 'https://registry.brika.dev/@test/plugin/-/plugin-1.0.0.tgz',
          },
        })
        .file('/test/home/.system/plugins/node_modules/@test/plugin/package.json', {
          version: '1.0.0',
        })
        .apply();
      // Registry serves a newer 2.0.0; the tarball download returns bytes for that URL.
      bun.fetch(async (input) => {
        const url = `${input}`;
        if (url === tarballUrl) {
          return new Response(new Uint8Array([1, 2, 3]));
        }
        return new Response(
          JSON.stringify({
            'dist-tags': { latest: '2.0.0' },
            versions: { '2.0.0': { dist: { tarball: tarballUrl } } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      });
      mockConfigLoader.load.mockResolvedValue({
        plugins: [],
        defaultRegistry: 'https://registry.brika.dev',
        npmRegistries: {},
      });

      const phases: OperationProgress[] = [];
      for await (const progress of registry.update('@test/plugin')) {
        phases.push(progress);
      }

      // The registry is re-queried and the newer tarball reinstalled by a verified file: path…
      expect(
        phases.some(
          (p) => p.message?.includes('Updating to 2.0.0 from registry.brika.dev') === true
        )
      ).toBe(true);
      expect(
        bun.spawnCalls.some((c) =>
          c.cmd.some((a) => a.includes('@file:') && a.includes('plugin-2.0.0.tgz'))
        )
      ).toBe(true);
      // …and brika.yml records the new concrete version.
      expect(mockConfigLoader.addPlugin).toHaveBeenCalledWith('@test/plugin', '2.0.0');
    });

    test('reloads the named plugin after updating so the new code runs', async () => {
      bun.spawn({ exitCode: 0 }).apply();

      for await (const _ of registry.update('@test/plugin')) {
        // Consume progress
      }

      // `bun update` only rewrites node_modules; the plugin must be reloaded to run the new code
      // (which also recompiles it, surfacing the build trace).
      expect(mockPluginManager.load.mock.calls.some((c) => c[0] === '@test/plugin')).toBe(true);
    });

    test('reloads every bun-managed plugin on an update-all (no name)', async () => {
      bun
        .spawn({ exitCode: 0 })
        .file('/test/home/.system/plugins/package.json', {
          dependencies: { '@a/p': '1.0.0', '@b/q': '2.0.0' },
        })
        .file('/test/home/.system/plugins/node_modules/@a/p/package.json', { version: '1.0.0' })
        .file('/test/home/.system/plugins/node_modules/@b/q/package.json', { version: '2.0.0' })
        .apply();

      for await (const _ of registry.update()) {
        // Consume progress
      }

      const reloaded = mockPluginManager.load.mock.calls.map((c) => c[0]);
      expect(reloaded).toContain('@a/p');
      expect(reloaded).toContain('@b/q');
    });

    test('one plugin failing to reload does not abort an update-all', async () => {
      bun
        .spawn({ exitCode: 0 })
        .file('/test/home/.system/plugins/package.json', {
          dependencies: { '@a/p': '1.0.0', '@b/q': '2.0.0' },
        })
        .file('/test/home/.system/plugins/node_modules/@a/p/package.json', { version: '1.0.0' })
        .file('/test/home/.system/plugins/node_modules/@b/q/package.json', { version: '2.0.0' })
        .apply();
      mockPluginManager.load.mockRejectedValueOnce(new Error('boom'));

      const phases: OperationProgress[] = [];
      for await (const progress of registry.update()) {
        phases.push(progress);
      }

      // The batch still completes despite one reload throwing.
      expect(phases.some((p) => p.phase === 'complete')).toBe(true);
      expect(mockPluginManager.load.mock.calls).toHaveLength(2);
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
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0]?.cmd).toEqual([process.execPath, 'update', '--ignore-scripts']);
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
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0]?.cmd).toEqual([
        process.execPath,
        'update',
        '@test/plugin',
        '--ignore-scripts',
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

    test('returns update info when dependencies exist', async () => {
      bun
        .fs({
          '/test/home/.system/plugins/package.json': {
            dependencies: { '@test/plugin': '^1.0.0' },
          },
          '/test/home/.system/plugins/node_modules/@test/plugin/package.json': {
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
          '/test/home/.system/plugins/package.json': {
            dependencies: { '@test/plugin': '^1.0.0' },
          },
          '/test/home/.system/plugins/node_modules/@test/plugin/package.json': {
            version: '1.0.0',
          },
        })
        .spawn({ exitCode: 0, stdout: '1.0.0\n' })
        .apply();

      const result = await registry.checkUpdates();

      expect(result).toHaveLength(1);
      expect(result[0]?.updateAvailable).toBe(false);
    });

    test('reports no update when the registry version is older (locally bumped ahead)', async () => {
      bun
        .fs({
          '/test/home/.system/plugins/package.json': {
            dependencies: { '@test/plugin': '^0.4.0' },
          },
          '/test/home/.system/plugins/node_modules/@test/plugin/package.json': {
            version: '0.4.0',
          },
        })
        .spawn({ exitCode: 0, stdout: '0.3.1\n' })
        .apply();

      const result = await registry.checkUpdates();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        currentVersion: '0.4.0',
        latestVersion: '0.3.1',
        updateAvailable: false,
      });
    });

    test('treats an uncomparable registry version as no update', async () => {
      bun
        .fs({
          '/test/home/.system/plugins/package.json': {
            dependencies: { '@test/plugin': '^1.0.0' },
          },
          '/test/home/.system/plugins/node_modules/@test/plugin/package.json': {
            version: '1.0.0',
          },
        })
        .spawn({ exitCode: 0, stdout: 'not-a-version\n' })
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
          '/test/home/.system/plugins/package.json': {
            dependencies: {
              '@test/old-plugin': '^1.0.0',
            },
          },
          '/test/home/.system/plugins/node_modules/@test/old-plugin/package.json': {
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
          '/test/home/.system/plugins/package.json': {
            dependencies: {
              '@test/broken': '^1.0.0',
            },
          },
          '/test/home/.system/plugins/node_modules/@test/broken/package.json': {
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
// Local/workspace plugin tests: uses real temp directories for fs operations
// (mkdir, symlink, readlink, unlink) to avoid mock.module pollution.
// ─────────────────────────────────────────────────────────────────────────────

describe('PluginRegistry: local plugins', () => {
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
    // The registry roots installed plugins under the hidden .system/ dir.
    pluginsDir = join(tmpHome, '.system', 'plugins');
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
    provide(StateStore, { get: mock().mockReturnValue(undefined) });

    registry = get(PluginRegistry);
  });

  afterEach(async () => {
    await rm(tmpHome, { recursive: true, force: true });
  });

  test('workspace install links local plugin and records it in brika.yml, not the bun manifest', async () => {
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

    // A local plugin must NOT land in pluginsDir/package.json: a `workspace:*` entry in this
    // non-workspace manifest makes every later `bun install` abort. It is tracked via the symlink
    // above plus the brika.yml entry instead.
    const pkg = await Bun.file(join(pluginsDir, 'package.json')).json();
    expect(pkg.dependencies['@test/ws-plugin']).toBeUndefined();
  });

  test('concurrent local installs link both without polluting the bun manifest', async () => {
    const dirA = join(tmpHome, 'plugin-a');
    const dirB = join(tmpHome, 'plugin-b');
    await mkdir(dirA, { recursive: true });
    await mkdir(dirB, { recursive: true });
    await writeFile(join(dirA, 'package.json'), JSON.stringify({ name: '@test/a' }));
    await writeFile(join(dirB, 'package.json'), JSON.stringify({ name: '@test/b' }));

    const dirByName: Record<string, string> = { '@test/a': dirA, '@test/b': dirB };
    mockConfigLoader.resolvePluginEntry.mockImplementation((entry: { name: string }) =>
      Promise.resolve({ rootDirectory: dirByName[entry.name] })
    );

    const drain = async (gen: AsyncGenerator<OperationProgress>): Promise<void> => {
      for await (const _ of gen) {
        // consume progress
      }
    };

    await Promise.all([
      drain(registry.install('@test/a', 'workspace:*')),
      drain(registry.install('@test/b', 'workspace:*')),
    ]);

    // Both are symlinked…
    expect(await readlink(join(pluginsDir, 'node_modules', '@test/a'))).toBe(dirA);
    expect(await readlink(join(pluginsDir, 'node_modules', '@test/b'))).toBe(dirB);
    // …and neither pollutes the install manifest.
    const pkg = await Bun.file(join(pluginsDir, 'package.json')).json();
    expect(pkg.dependencies['@test/a']).toBeUndefined();
    expect(pkg.dependencies['@test/b']).toBeUndefined();
  });

  test('init prunes stale local (workspace:/file:) entries from the install manifest', async () => {
    await Bun.write(
      join(pluginsDir, 'package.json'),
      JSON.stringify({
        name: 'brika-plugins',
        private: true,
        dependencies: {
          '@test/ws': 'workspace:*',
          '@test/file': 'file:/some/abs/path',
          '@test/npm': '1.2.3',
          // A verified registry tarball installed by file: (NOT a local plugin) must survive the prune.
          '@test/registry': 'file:/abs/.cache/tarballs/@test+registry-1.0.0.tgz',
        },
      })
    );

    await registry.init();

    const pkg = await Bun.file(join(pluginsDir, 'package.json')).json();
    // The two local specifiers (which break `bun install` here) are gone…
    expect(pkg.dependencies['@test/ws']).toBeUndefined();
    expect(pkg.dependencies['@test/file']).toBeUndefined();
    // …while a real npm dependency and a verified registry .tgz (bun-managed) are left intact.
    expect(pkg.dependencies['@test/npm']).toBe('1.2.3');
    expect(pkg.dependencies['@test/registry']).toBe(
      'file:/abs/.cache/tarballs/@test+registry-1.0.0.tgz'
    );
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

  test('standalone plugin install fails when frozen-lockfile install returns non-zero', async () => {
    // A standalone plugin (no workspace parent) with a broken/stale lockfile
    // must NOT silently continue: it would crash at load. Surface a real error.
    const pluginSrc = join(tmpHome, 'failing-deps');
    await mkdir(pluginSrc, { recursive: true });
    await writeFile(join(pluginSrc, 'package.json'), JSON.stringify({ name: '@test/failing' }));

    mockConfigLoader.resolvePluginEntry.mockResolvedValue({ rootDirectory: pluginSrc });
    spawnExitCode = 1;

    const events: OperationProgress[] = [];
    for await (const progress of registry.install('@test/failing', 'workspace:*')) {
      events.push(progress);
    }

    const errorProgress = events.find((p) => p.phase === 'error');
    expect(errorProgress).toBeDefined();
    expect(errorProgress?.errorCode).toBe('PLUGIN_DEPS_INSTALL_FAILED');
    expect(events.map((e) => e.phase)).not.toContain('complete');
    // brika.yml is written last, so a failed install never records the plugin.
    expect(mockConfigLoader.addPlugin).not.toHaveBeenCalled();
  });

  test('workspace member install continues when dependency install returns non-zero', async () => {
    // A genuine workspace member has its deps installed at the workspace root,
    // so a frozen-lockfile non-zero in the member dir is expected and tolerated.
    const wsRoot = join(tmpHome, 'ws-root');
    const pluginSrc = join(wsRoot, 'plugins', 'member');
    await mkdir(pluginSrc, { recursive: true });
    await writeFile(
      join(wsRoot, 'package.json'),
      JSON.stringify({ name: 'ws-root', private: true, workspaces: ['plugins/*'] })
    );
    await writeFile(join(pluginSrc, 'package.json'), JSON.stringify({ name: '@test/member' }));

    mockConfigLoader.resolvePluginEntry.mockResolvedValue({ rootDirectory: pluginSrc });
    spawnExitCode = 1;

    const phases: OperationProgress['phase'][] = [];
    for await (const progress of registry.install('@test/member', 'workspace:*')) {
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
