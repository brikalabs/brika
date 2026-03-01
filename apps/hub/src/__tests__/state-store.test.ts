/**
 * Tests for StateStore - plugin state persistence
 */

import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { get, provide, reset, stub, useTestBed } from '@brika/di/testing';
import { HubConfig } from '@/runtime/config';
import { Logger } from '@/runtime/logs/log-router';
import { StateStore } from '@/runtime/state/state-store';

useTestBed({
  autoStub: false,
});

const TEST_DIR = join(import.meta.dir, '.test-state-store');

describe('StateStore', () => {
  let store: StateStore;
  let testPluginDir: string;

  beforeAll(async () => {
    await rm(TEST_DIR, {
      recursive: true,
      force: true,
    });
    await mkdir(TEST_DIR, {
      recursive: true,
    });

    // Create a test plugin directory with valid package.json
    testPluginDir = join(TEST_DIR, 'test-plugin');
    await mkdir(testPluginDir, {
      recursive: true,
    });
    await Bun.write(
      join(testPluginDir, 'package.json'),
      JSON.stringify({
        name: '@test/plugin',
        version: '1.0.0',
        main: './index.ts',
        engines: {
          brika: '^0.2.0',
        },
      })
    );
    await Bun.write(join(testPluginDir, 'index.ts'), 'export default {}');
  });

  beforeEach(() => {
    provide(HubConfig, {
      homeDir: TEST_DIR,
    });
    stub(Logger);
    store = get(StateStore);
  });

  afterEach(async () => {
    reset();
    // Clean up state file between tests
    const stateFile = join(TEST_DIR, 'state.json');
    try {
      await rm(stateFile, {
        force: true,
      });
    } catch {
      // Ignore if file doesn't exist
    }
  });

  afterAll(async () => {
    await rm(TEST_DIR, {
      recursive: true,
      force: true,
    });
  });

  describe('init', () => {
    test('creates state file if it does not exist', async () => {
      await store.init();

      const stateFile = Bun.file(join(TEST_DIR, 'state.json'));
      expect(await stateFile.exists()).toBe(true);
    });

    test('loads existing state file', async () => {
      // Create a pre-existing state file
      await Bun.write(
        join(TEST_DIR, 'state.json'),
        JSON.stringify({
          plugins: {
            '@test/existing': {
              name: '@test/existing',
              rootDirectory: '/path/to/plugin',
              entryPoint: '/path/to/plugin/index.ts',
              uid: 'abc123',
              enabled: true,
              health: 'running',
              lastError: null,
              updatedAt: Date.now(),
            },
          },
        })
      );

      await store.init();

      const plugin = store.get('@test/existing');
      expect(plugin).toBeDefined();
      expect(plugin?.name).toBe('@test/existing');
      expect(plugin?.uid).toBe('abc123');
    });
  });

  describe('registerPlugin', () => {
    test('registers a new plugin', async () => {
      await store.init();

      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'test123',
      });

      const plugin = store.get('@test/plugin');
      expect(plugin).toBeDefined();
      expect(plugin?.name).toBe('@test/plugin');
      expect(plugin?.uid).toBe('test123');
      expect(plugin?.enabled).toBe(true);
      expect(plugin?.health).toBe('restarting');
    });

    test('preserves enabled state on re-registration', async () => {
      await store.init();

      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'test123',
      });

      await store.setEnabled('@test/plugin', false);

      // Re-register
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'test456',
      });

      const plugin = store.get('@test/plugin');
      expect(plugin?.enabled).toBe(false);
    });
  });

  describe('get / getByUid', () => {
    test('returns undefined for non-existent plugin', async () => {
      await store.init();

      expect(store.get('non-existent')).toBeUndefined();
      expect(store.getByUid('non-existent')).toBeUndefined();
    });

    test('gets plugin by name', async () => {
      await store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'uid123',
      });

      const plugin = store.get('@test/plugin');
      expect(plugin?.uid).toBe('uid123');
    });

    test('gets plugin by uid', async () => {
      await store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'uid456',
      });

      const plugin = store.getByUid('uid456');
      expect(plugin?.name).toBe('@test/plugin');
    });
  });

  describe('listInstalled', () => {
    test('returns empty array when no plugins', async () => {
      await store.init();

      expect(store.listInstalled()).toEqual([]);
    });

    test('returns all installed plugins', async () => {
      await store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'uid1',
      });

      const plugins = store.listInstalled();
      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe('@test/plugin');
    });
  });

  describe('setEnabled', () => {
    test('updates enabled state', async () => {
      await store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'uid1',
      });

      await store.setEnabled('@test/plugin', false);

      expect(store.get('@test/plugin')?.enabled).toBe(false);
    });

    test('ignores non-existent plugin', async () => {
      await store.init();

      // Should not throw
      await store.setEnabled('non-existent', true);
    });
  });

  describe('setHealth', () => {
    test('updates health state', async () => {
      await store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'uid1',
      });

      await store.setHealth('@test/plugin', 'running');

      expect(store.get('@test/plugin')?.health).toBe('running');
    });

    test('updates lastError when provided', async () => {
      await store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'uid1',
      });

      await store.setHealth('@test/plugin', 'crashed', {
        key: 'plugins:errors.crashed',
        params: {
          reason: 'Connection timeout',
        },
        message: 'Connection timeout',
      });

      const plugin = store.get('@test/plugin');
      expect(plugin?.health).toBe('crashed');
      expect(plugin?.lastError).toEqual(
        expect.objectContaining({
          key: 'plugins:errors.crashed',
          message: 'Connection timeout',
        })
      );
    });

    test('ignores non-existent plugin', async () => {
      await store.init();

      // Should not throw
      await store.setHealth('non-existent', 'running');
    });
  });

  describe('remove', () => {
    test('removes plugin from state', async () => {
      await store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'uid1',
      });

      await store.remove('@test/plugin');

      expect(store.get('@test/plugin')).toBeUndefined();
    });
  });

  describe('upsert', () => {
    test('adds new plugin state', async () => {
      await store.init();

      await store.upsert({
        name: '@test/upserted',
        rootDirectory: '/path',
        entryPoint: '/path/index.ts',
        uid: 'upserted-uid',
        enabled: true,
        health: 'running',
        lastError: null,
        updatedAt: Date.now(),
      });

      expect(store.get('@test/upserted')).toBeDefined();
    });
  });

  describe('getMetadata', () => {
    test('returns undefined when metadata not cached', async () => {
      await store.init();

      expect(store.getMetadata('unknown')).toBeUndefined();
    });

    test('returns cached metadata after registration', async () => {
      await store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'uid1',
      });

      const metadata = store.getMetadata('@test/plugin');
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('@test/plugin');
      expect(metadata?.version).toBe('1.0.0');
    });
  });

  describe('getWithMetadata / getByUidWithMetadata', () => {
    test('returns plugin with metadata', async () => {
      await store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'uid1',
      });

      const plugin = store.getWithMetadata('@test/plugin');
      expect(plugin?.version).toBe('1.0.0');
      expect(plugin?.metadata.name).toBe('@test/plugin');
    });

    test('returns undefined for non-existent plugin', async () => {
      await store.init();

      expect(store.getWithMetadata('unknown')).toBeUndefined();
      expect(store.getByUidWithMetadata('unknown')).toBeUndefined();
    });
  });

  describe('listInstalledWithMetadata', () => {
    test('returns plugins with metadata', async () => {
      await store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'uid1',
      });

      const plugins = store.listInstalledWithMetadata();
      expect(plugins).toHaveLength(1);
      expect(plugins[0].version).toBe('1.0.0');
    });
  });

  describe('syncToConfig', () => {
    test('removes plugins not in config', async () => {
      await store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'uid1',
      });

      await store.syncToConfig(new Set()); // Empty config

      expect(store.get('@test/plugin')).toBeUndefined();
    });

    test('keeps plugins that are in config', async () => {
      await store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'uid1',
      });

      await store.syncToConfig(
        new Set([
          '@test/plugin',
        ])
      );

      expect(store.get('@test/plugin')).toBeDefined();
    });
  });

  describe('loadMetadataCache', () => {
    test('loads metadata for all installed plugins', async () => {
      // Create state file with existing plugin
      await Bun.write(
        join(TEST_DIR, 'state.json'),
        JSON.stringify({
          plugins: {
            '@test/plugin': {
              name: '@test/plugin',
              rootDirectory: testPluginDir,
              entryPoint: join(testPluginDir, 'index.ts'),
              uid: 'existing-uid',
              enabled: true,
              health: 'stopped',
              lastError: null,
              updatedAt: Date.now(),
            },
          },
        })
      );

      await store.init();
      await store.loadMetadataCache();

      const metadata = store.getMetadata('@test/plugin');
      expect(metadata).toBeDefined();
      expect(metadata?.name).toBe('@test/plugin');
      expect(metadata?.version).toBe('1.0.0');
    });
  });

  describe('refreshMetadata', () => {
    test('updates metadata cache for a specific plugin', async () => {
      await store.init();

      const metadata = await store.refreshMetadata('@test/plugin', testPluginDir);

      expect(metadata.name).toBe('@test/plugin');
      expect(metadata.version).toBe('1.0.0');
      expect(store.getMetadata('@test/plugin')).toBeDefined();
    });
  });

  describe('getByUidWithMetadata', () => {
    test('returns plugin with metadata when found by uid', async () => {
      await store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'specific-uid',
      });

      const plugin = store.getByUidWithMetadata('specific-uid');
      expect(plugin).toBeDefined();
      expect(plugin?.name).toBe('@test/plugin');
      expect(plugin?.version).toBe('1.0.0');
      expect(plugin?.metadata.name).toBe('@test/plugin');
    });
  });
});
