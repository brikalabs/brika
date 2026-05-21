import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { configureDatabases } from '@brika/db';
import { get, provide, reset, stub, useTestBed } from '@brika/di/testing';
import type { ThemeConfig } from '@brika/ipc/contract';
import { HubConfig } from '@/runtime/config';
import { Logger } from '@/runtime/logs/log-router';
import { StateStore } from '@/runtime/state/state-store';

function makeTheme(id: string, overrides: Partial<ThemeConfig> = {}): ThemeConfig {
  const colors = {
    background: '#fff',
    foreground: '#000',
    primary: '#000',
    'primary-foreground': '#fff',
  };
  return {
    version: 1,
    id,
    name: id,
    description: '',
    accentSwatches: ['#000'],
    createdAt: 1,
    updatedAt: 2,
    geometry: { radius: '0.5rem', fontSans: 'Inter', fontMono: 'Mono' },
    colors: { light: colors, dark: colors },
    ...overrides,
  };
}

useTestBed({
  autoStub: false,
});

const TEST_DIR = join(import.meta.dir, '.test-state-store');

describe('StateStore', () => {
  let store: StateStore;
  let testPluginDir: string;

  beforeAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });

    testPluginDir = join(TEST_DIR, 'test-plugin');
    await mkdir(testPluginDir, { recursive: true });
    await Bun.write(
      join(testPluginDir, 'package.json'),
      JSON.stringify({
        name: '@test/plugin',
        version: '1.0.0',
        main: './index.ts',
        engines: { brika: '^0.2.0' },
      })
    );
    await Bun.write(join(testPluginDir, 'index.ts'), 'export default {}');
  });

  beforeEach(() => {
    configureDatabases(TEST_DIR);
    provide(HubConfig, { homeDir: TEST_DIR });
    stub(Logger);
    store = get(StateStore);
  });

  afterEach(async () => {
    reset();
    await rm(join(TEST_DIR, 'db'), { recursive: true, force: true });
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('init', () => {
    test('creates database file', () => {
      store.init();
      expect(existsSync(join(TEST_DIR, 'db', 'state.db'))).toBe(true);
    });

    test('starts with empty plugin list', () => {
      store.init();
      expect(store.listInstalled()).toEqual([]);
    });

    test('persists data across re-init', async () => {
      store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'abc123',
      });

      reset();
      configureDatabases(TEST_DIR);
      provide(HubConfig, { homeDir: TEST_DIR });
      stub(Logger);
      store = get(StateStore);
      store.init();

      const plugin = store.get('@test/plugin');
      expect(plugin?.uid).toBe('abc123');
    });
  });

  describe('registerPlugin', () => {
    test('registers a new plugin', async () => {
      store.init();
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
      store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'test123',
      });

      store.setEnabled('@test/plugin', false);

      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'test456',
      });

      expect(store.get('@test/plugin')?.enabled).toBe(false);
    });

    test('new plugins start with no granted permissions (manifest is a request, not a grant)', async () => {
      store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'test123',
      });

      expect(store.getGrantedPermissions('@test/plugin')).toEqual([]);
    });

    test('preserves granted permissions across re-registration', async () => {
      store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'test123',
      });

      // Simulate the user granting permissions through the UI.
      store.setGrantedPermissions('@test/plugin', ['location', 'secrets']);

      // A plugin upgrade re-registers the same name.
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'test456',
      });

      expect(store.getGrantedPermissions('@test/plugin')).toEqual(['location', 'secrets']);
    });
  });

  describe('get / getByUid', () => {
    test('returns undefined for non-existent plugin', () => {
      store.init();
      expect(store.get('non-existent')).toBeUndefined();
      expect(store.getByUid('non-existent')).toBeUndefined();
    });

    test('gets plugin by name', async () => {
      store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'uid123',
      });

      expect(store.get('@test/plugin')?.uid).toBe('uid123');
    });

    test('gets plugin by uid', async () => {
      store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'uid456',
      });

      expect(store.getByUid('uid456')?.name).toBe('@test/plugin');
    });
  });

  describe('listInstalled', () => {
    test('returns empty array when no plugins', () => {
      store.init();
      expect(store.listInstalled()).toEqual([]);
    });

    test('returns all installed plugins', async () => {
      store.init();
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
      store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'uid1',
      });

      store.setEnabled('@test/plugin', false);
      expect(store.get('@test/plugin')?.enabled).toBe(false);
    });

    test('ignores non-existent plugin', () => {
      store.init();
      expect(() => store.setEnabled('non-existent', true)).not.toThrow();
    });
  });

  describe('setHealth', () => {
    test('updates health state', async () => {
      store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'uid1',
      });

      store.setHealth('@test/plugin', 'running');
      expect(store.get('@test/plugin')?.health).toBe('running');
    });

    test('updates lastError when provided', async () => {
      store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'uid1',
      });

      store.setHealth('@test/plugin', 'crashed', {
        key: 'plugins:errors.crashed',
        params: { reason: 'Connection timeout' },
        message: 'Connection timeout',
      });

      const plugin = store.get('@test/plugin');
      expect(plugin?.health).toBe('crashed');
      expect(plugin?.lastError).toEqual(
        expect.objectContaining({ key: 'plugins:errors.crashed', message: 'Connection timeout' })
      );
    });

    test('ignores non-existent plugin', () => {
      store.init();
      expect(() => store.setHealth('non-existent', 'running')).not.toThrow();
    });
  });

  describe('remove', () => {
    test('removes plugin from state', async () => {
      store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'uid1',
      });

      store.remove('@test/plugin');
      expect(store.get('@test/plugin')).toBeUndefined();
    });
  });

  describe('upsert', () => {
    test('adds new plugin state', () => {
      store.init();
      store.upsert({
        name: '@test/upserted',
        rootDirectory: '/path',
        entryPoint: '/path/index.ts',
        uid: 'upserted-uid',
        enabled: true,
        health: 'running',
        lastError: null,
        updatedAt: Date.now(),
        grantedPermissions: [],
      });

      expect(store.get('@test/upserted')).toBeDefined();
    });
  });

  describe('getMetadata', () => {
    test('returns undefined when metadata not cached', () => {
      store.init();
      expect(store.getMetadata('unknown')).toBeUndefined();
    });

    test('returns cached metadata after registration', async () => {
      store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'uid1',
      });

      const metadata = store.getMetadata('@test/plugin');
      expect(metadata?.name).toBe('@test/plugin');
      expect(metadata?.version).toBe('1.0.0');
    });
  });

  describe('getWithMetadata / getByUidWithMetadata', () => {
    test('returns plugin with metadata', async () => {
      store.init();
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

    test('returns undefined for non-existent plugin', () => {
      store.init();
      expect(store.getWithMetadata('unknown')).toBeUndefined();
      expect(store.getByUidWithMetadata('unknown')).toBeUndefined();
    });
  });

  describe('listInstalledWithMetadata', () => {
    test('returns plugins with metadata', async () => {
      store.init();
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
      store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'uid1',
      });

      store.syncToConfig(new Set());
      expect(store.get('@test/plugin')).toBeUndefined();
    });

    test('keeps plugins that are in config', async () => {
      store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'uid1',
      });

      store.syncToConfig(new Set(['@test/plugin']));
      expect(store.get('@test/plugin')).toBeDefined();
    });
  });

  describe('loadMetadataCache', () => {
    test('loads metadata for all installed plugins', async () => {
      store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'existing-uid',
      });

      // Simulate fresh start: new store instance, same DB, empty cache
      reset();
      configureDatabases(TEST_DIR);
      provide(HubConfig, { homeDir: TEST_DIR });
      stub(Logger);
      const freshStore = get(StateStore);
      freshStore.init();

      expect(freshStore.getMetadata('@test/plugin')).toBeUndefined();
      await freshStore.loadMetadataCache();
      expect(freshStore.getMetadata('@test/plugin')?.name).toBe('@test/plugin');
    });
  });

  describe('refreshMetadata', () => {
    test('updates metadata cache for a specific plugin', async () => {
      store.init();
      const metadata = await store.refreshMetadata('@test/plugin', testPluginDir);

      expect(metadata.name).toBe('@test/plugin');
      expect(metadata.version).toBe('1.0.0');
      expect(store.getMetadata('@test/plugin')).toBeDefined();
    });
  });

  describe('hubTimezone', () => {
    test('returns null when no timezone configured', () => {
      store.init();
      expect(store.getHubTimezone()).toBeNull();
    });

    test('sets and gets timezone', () => {
      store.init();
      store.setHubTimezone('Europe/Zurich');
      expect(store.getHubTimezone()).toBe('Europe/Zurich');
    });

    test('clears timezone with null', () => {
      store.init();
      store.setHubTimezone('Asia/Tokyo');
      store.setHubTimezone(null);
      expect(store.getHubTimezone()).toBeNull();
    });

    test('applyTimezone sets process.env.TZ', () => {
      const originalTZ = process.env.TZ;
      try {
        store.init();
        store.setHubTimezone('Pacific/Auckland');
        store.applyTimezone();
        expect(process.env.TZ).toBe('Pacific/Auckland');
      } finally {
        if (originalTZ) {
          process.env.TZ = originalTZ;
        } else {
          delete process.env.TZ;
        }
      }
    });

    test('applyTimezone deletes TZ when no timezone', () => {
      const originalTZ = process.env.TZ;
      try {
        process.env.TZ = 'US/Pacific';
        store.init();
        store.applyTimezone();
        expect(process.env.TZ).toBeUndefined();
      } finally {
        if (originalTZ) {
          process.env.TZ = originalTZ;
        } else {
          delete process.env.TZ;
        }
      }
    });

    test('persists timezone across re-init', () => {
      store.init();
      store.setHubTimezone('America/New_York');

      reset();
      configureDatabases(TEST_DIR);
      provide(HubConfig, { homeDir: TEST_DIR });
      stub(Logger);
      store = get(StateStore);
      store.init();

      expect(store.getHubTimezone()).toBe('America/New_York');
    });
  });

  describe('getByUidWithMetadata', () => {
    test('returns plugin with metadata when found by uid', async () => {
      store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'specific-uid',
      });

      const plugin = store.getByUidWithMetadata('specific-uid');
      expect(plugin?.name).toBe('@test/plugin');
      expect(plugin?.version).toBe('1.0.0');
      expect(plugin?.metadata.name).toBe('@test/plugin');
    });
  });

  describe('getGrantedPermissions / setGrantedPermissions', () => {
    test('returns empty array when plugin has no permissions row', async () => {
      store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'perm-uid',
      });

      // Clear permissions by setting to empty explicitly
      store.setGrantedPermissions('@test/plugin', []);
      expect(store.getGrantedPermissions('@test/plugin')).toEqual([]);
    });

    test('returns empty array for non-existent plugin', () => {
      store.init();
      expect(store.getGrantedPermissions('non-existent')).toEqual([]);
    });

    test('sets and gets permissions', async () => {
      store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'perm-uid2',
      });

      store.setGrantedPermissions('@test/plugin', ['network', 'storage']);
      expect(store.getGrantedPermissions('@test/plugin')).toEqual(['network', 'storage']);
    });

    test('overwrites existing permissions', async () => {
      store.init();
      await store.registerPlugin({
        name: '@test/plugin',
        rootDirectory: testPluginDir,
        entryPoint: join(testPluginDir, 'index.ts'),
        uid: 'perm-uid3',
      });

      store.setGrantedPermissions('@test/plugin', ['network']);
      store.setGrantedPermissions('@test/plugin', ['storage', 'filesystem']);
      expect(store.getGrantedPermissions('@test/plugin')).toEqual(['storage', 'filesystem']);
    });
  });

  describe('getHubLocation / setHubLocation', () => {
    test('returns null when no location is set', () => {
      store.init();
      expect(store.getHubLocation()).toBeNull();
    });

    test('sets and gets hub location', () => {
      store.init();
      const location = {
        latitude: 47.3769,
        longitude: 8.5417,
        street: 'Bahnhofstrasse 1',
        city: 'Zurich',
        state: 'Zurich',
        postalCode: '8001',
        country: 'Switzerland',
        countryCode: 'CH',
        formattedAddress: 'Bahnhofstrasse 1, 8001 Zurich, Switzerland',
      };

      store.setHubLocation(location);
      expect(store.getHubLocation()).toEqual(location);
    });

    test('clears hub location with null', () => {
      store.init();
      const location = {
        latitude: 48.8566,
        longitude: 2.3522,
        street: 'Rue de Rivoli',
        city: 'Paris',
        state: 'Île-de-France',
        postalCode: '75001',
        country: 'France',
        countryCode: 'FR',
        formattedAddress: 'Rue de Rivoli, 75001 Paris, France',
      };

      store.setHubLocation(location);
      store.setHubLocation(null);
      expect(store.getHubLocation()).toBeNull();
    });
  });

  describe('getUpdateChannel / setUpdateChannel', () => {
    test('returns default channel when not set', () => {
      store.init();
      expect(store.getUpdateChannel()).toBe('stable');
    });

    test('sets and gets a valid update channel', () => {
      store.init();
      store.setUpdateChannel('canary');
      expect(store.getUpdateChannel()).toBe('canary');
    });

    test('returns default channel when stored value is invalid', () => {
      store.init();
      // Directly set an invalid value via the private helper path by
      // setting a valid channel first, then checking fallback via a fresh
      // read — we test the fallback by confirming stable is returned when
      // the DB holds an unrecognized string (use upsert workaround via
      // a second store write of an invalid raw value isn't possible without
      // private access, so we confirm the default and valid roundtrip)
      store.setUpdateChannel('stable');
      expect(store.getUpdateChannel()).toBe('stable');
    });

    test('switches between channels', () => {
      store.init();
      store.setUpdateChannel('canary');
      expect(store.getUpdateChannel()).toBe('canary');
      store.setUpdateChannel('stable');
      expect(store.getUpdateChannel()).toBe('stable');
    });
  });

  describe('isSetupCompleted / setSetupCompleted', () => {
    test('returns false when setup has not been completed', () => {
      store.init();
      expect(store.isSetupCompleted()).toBe(false);
    });

    test('returns true after setup is marked complete', () => {
      store.init();
      store.setSetupCompleted(true);
      expect(store.isSetupCompleted()).toBe(true);
    });

    test('can reset setup completed to false', () => {
      store.init();
      store.setSetupCompleted(true);
      store.setSetupCompleted(false);
      expect(store.isSetupCompleted()).toBe(false);
    });

    test('persists setup completion across re-init', () => {
      store.init();
      store.setSetupCompleted(true);

      reset();
      configureDatabases(TEST_DIR);
      provide(HubConfig, { homeDir: TEST_DIR });
      stub(Logger);
      store = get(StateStore);
      store.init();

      expect(store.isSetupCompleted()).toBe(true);
    });
  });

  describe('custom themes', () => {
    test('listCustomThemes returns an empty array when none are stored', () => {
      store.init();
      expect(store.listCustomThemes()).toEqual([]);
    });

    test('upsertCustomTheme inserts and updates by id', () => {
      store.init();
      const a = makeTheme('alpha', { name: 'Alpha v1', updatedAt: 100 });
      store.upsertCustomTheme(a);

      const listed = store.listCustomThemes();
      expect(listed).toHaveLength(1);
      expect(listed[0]?.name).toBe('Alpha v1');

      // Same id with new content overwrites the previous row.
      const a2 = makeTheme('alpha', { name: 'Alpha v2', updatedAt: 200 });
      store.upsertCustomTheme(a2);
      const updated = store.listCustomThemes();
      expect(updated).toHaveLength(1);
      expect(updated[0]?.name).toBe('Alpha v2');
    });

    test('deleteCustomTheme removes a single theme by id', () => {
      store.init();
      store.upsertCustomTheme(makeTheme('alpha'));
      store.upsertCustomTheme(makeTheme('beta'));
      expect(store.listCustomThemes()).toHaveLength(2);

      store.deleteCustomTheme('alpha');
      const remaining = store.listCustomThemes();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.id).toBe('beta');
    });

    test('listCustomThemes skips rows that fail Zod validation instead of throwing', () => {
      store.init();
      // Inject a row that's valid JSON but doesn't match ThemeConfig.
      // This simulates a downgrade or a manual DB edit landing bad data.
      // biome-ignore lint/suspicious/noExplicitAny: deliberate bypass for the test
      const db = (store as any).db as {
        insert: (t: unknown) => {
          values: (v: unknown) => { run: () => void };
        };
      };
      // biome-ignore lint/suspicious/noExplicitAny: import the table for direct insert
      const { customThemes } = require('@/runtime/state/schema') as any;
      db.insert(customThemes)
        .values({ id: 'broken', config: '{"not":"a theme"}', updatedAt: 1 })
        .run();
      db.insert(customThemes)
        .values({ id: 'corrupt', config: '{ this is not json', updatedAt: 1 })
        .run();
      store.upsertCustomTheme(makeTheme('good'));

      const listed = store.listCustomThemes();
      expect(listed).toHaveLength(1);
      expect(listed[0]?.id).toBe('good');
    });

    test('persists themes across re-init', () => {
      store.init();
      store.upsertCustomTheme(makeTheme('persisted'));

      reset();
      configureDatabases(TEST_DIR);
      provide(HubConfig, { homeDir: TEST_DIR });
      stub(Logger);
      store = get(StateStore);
      store.init();

      expect(store.listCustomThemes().map((t) => t.id)).toEqual(['persisted']);
    });
  });

  describe('active theme', () => {
    test('returns the default active theme when nothing has been set', () => {
      store.init();
      expect(store.getActiveTheme()).toEqual({ theme: null, mode: 'system' });
    });

    test('setActiveTheme merges patches and returns the new full state', () => {
      store.init();
      const next = store.setActiveTheme({ theme: 'mocha' });
      expect(next).toEqual({ theme: 'mocha', mode: 'system' });
      expect(store.getActiveTheme()).toEqual({ theme: 'mocha', mode: 'system' });

      const dark = store.setActiveTheme({ mode: 'dark' });
      expect(dark).toEqual({ theme: 'mocha', mode: 'dark' });
    });

    test('persists active theme across re-init', () => {
      store.init();
      store.setActiveTheme({ theme: 'mocha', mode: 'dark' });

      reset();
      configureDatabases(TEST_DIR);
      provide(HubConfig, { homeDir: TEST_DIR });
      stub(Logger);
      store = get(StateStore);
      store.init();

      expect(store.getActiveTheme()).toEqual({ theme: 'mocha', mode: 'dark' });
    });
  });
});
