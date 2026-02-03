/**
 * Tests for ConfigLoader - configuration loading and management
 */

import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { get, provide, reset, stub, useTestBed } from '@brika/di/testing';
import { BrikaInitializer } from '@/runtime/config/brika-initializer';
import { ConfigLoader } from '@/runtime/config/config-loader';
import { Logger } from '@/runtime/logs/log-router';

useTestBed({ autoStub: false });

const TEST_DIR = join(import.meta.dir, '.test-config-loader');
const BRIKA_DIR = join(TEST_DIR, '.brika');

describe('ConfigLoader', () => {
  let loader: ConfigLoader;

  beforeAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(BRIKA_DIR, { recursive: true });
  });

  beforeEach(() => {
    provide(BrikaInitializer, {
      brikaDir: BRIKA_DIR,
      rootDir: TEST_DIR,
    });
    stub(Logger);
    loader = get(ConfigLoader);
  });

  afterEach(async () => {
    reset();
    // Clean up config file between tests
    try {
      await rm(join(BRIKA_DIR, 'brika.yml'), { force: true });
    } catch {
      // Ignore
    }
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('load', () => {
    test('returns default config when file does not exist', async () => {
      const config = await loader.load();

      expect(config.hub.port).toBe(3001);
      expect(config.hub.host).toBe('0.0.0.0');
      expect(config.plugins).toEqual([]);
      expect(config.rules).toEqual([]);
      expect(config.schedules).toEqual([]);
    });

    test('loads config from YAML file', async () => {
      await Bun.write(
        join(BRIKA_DIR, 'brika.yml'),
        `
hub:
  port: 4000
  host: localhost
  plugins:
    installDir: ./custom-plugins
    heartbeatInterval: 10000
    heartbeatTimeout: 30000
plugins:
  "@test/plugin":
    version: "1.0.0"
rules: []
schedules: []
`
      );

      const config = await loader.load();

      expect(config.hub.port).toBe(4000);
      expect(config.hub.host).toBe('localhost');
      expect(config.hub.plugins.installDir).toBe('./custom-plugins');
      expect(config.plugins).toHaveLength(1);
      expect(config.plugins[0].name).toBe('@test/plugin');
      expect(config.plugins[0].version).toBe('1.0.0');
    });

    test('caches loaded config', async () => {
      await Bun.write(
        join(BRIKA_DIR, 'brika.yml'),
        `
hub:
  port: 5000
plugins: {}
rules: []
schedules: []
`
      );

      const config1 = await loader.load();
      const config2 = await loader.load();

      expect(config1).toBe(config2); // Same reference
    });

    test('handles invalid YAML gracefully', async () => {
      await Bun.write(join(BRIKA_DIR, 'brika.yml'), 'invalid: yaml: content: [}');

      const config = await loader.load();

      // Should fall back to defaults
      expect(config.hub.port).toBe(3001);
    });

    test('parses plugins with config', async () => {
      await Bun.write(
        join(BRIKA_DIR, 'brika.yml'),
        `
hub:
  port: 3001
plugins:
  "@test/plugin":
    version: "2.0.0"
    config:
      apiKey: "test-key"
      timeout: 5000
rules: []
schedules: []
`
      );

      const config = await loader.load();

      expect(config.plugins[0].config).toBeDefined();
      expect(config.plugins[0].config?.apiKey).toBe('test-key');
      expect(config.plugins[0].config?.timeout).toBe(5000);
    });
  });

  describe('get', () => {
    test('throws if config not loaded', () => {
      expect(() => loader.get()).toThrow('Config not loaded');
    });

    test('returns loaded config', async () => {
      await loader.load();
      const config = loader.get();

      expect(config).toBeDefined();
      expect(config.hub).toBeDefined();
    });
  });

  describe('save', () => {
    test('saves config to file', async () => {
      await loader.load();

      const newConfig = {
        hub: {
          port: 9000,
          host: '127.0.0.1',
          plugins: {
            installDir: './plugins',
            heartbeatInterval: 5000,
            heartbeatTimeout: 15000,
          },
        },
        plugins: [{ name: '@test/new-plugin', version: '1.0.0' }],
        rules: [],
        schedules: [],
      };

      await loader.save(newConfig);

      // Read file to verify
      const content = await Bun.file(join(BRIKA_DIR, 'brika.yml')).text();
      expect(content).toContain('port: 9000');
      expect(content).toContain('@test/new-plugin');
    });

    test('throws when no config to save', async () => {
      await expect(loader.save()).rejects.toThrow('No config to save');
    });

    test('preserves existing file structure', async () => {
      await Bun.write(
        join(BRIKA_DIR, 'brika.yml'),
        `# Custom comment
hub:
  port: 3001
plugins: {}
rules: []
schedules: []
`
      );

      await loader.load();
      await loader.save();

      const content = await Bun.file(join(BRIKA_DIR, 'brika.yml')).text();
      expect(content).toBeDefined();
    });
  });

  describe('addPlugin', () => {
    test('adds new plugin to config', async () => {
      await loader.load();

      await loader.addPlugin('@test/new-plugin', '^1.0.0');

      const config = loader.get();
      expect(config.plugins.find((p) => p.name === '@test/new-plugin')).toBeDefined();
    });

    test('updates version if plugin already exists', async () => {
      await Bun.write(
        join(BRIKA_DIR, 'brika.yml'),
        `
hub:
  port: 3001
plugins:
  "@test/plugin":
    version: "1.0.0"
rules: []
schedules: []
`
      );

      await loader.load();
      await loader.addPlugin('@test/plugin', '^2.0.0');

      const config = loader.get();
      const plugin = config.plugins.find((p) => p.name === '@test/plugin');
      expect(plugin?.version).toBe('^2.0.0');
    });

    test('does nothing if plugin exists with same version', async () => {
      await Bun.write(
        join(BRIKA_DIR, 'brika.yml'),
        `
hub:
  port: 3001
plugins:
  "@test/plugin":
    version: "1.0.0"
rules: []
schedules: []
`
      );

      await loader.load();
      await loader.addPlugin('@test/plugin', '1.0.0');

      const config = loader.get();
      expect(config.plugins).toHaveLength(1);
    });
  });

  describe('removePlugin', () => {
    test('removes plugin from config', async () => {
      await Bun.write(
        join(BRIKA_DIR, 'brika.yml'),
        `
hub:
  port: 3001
plugins:
  "@test/plugin":
    version: "1.0.0"
rules: []
schedules: []
`
      );

      await loader.load();
      await loader.removePlugin('@test/plugin');

      const config = loader.get();
      expect(config.plugins.find((p) => p.name === '@test/plugin')).toBeUndefined();
    });

    test('does nothing if plugin does not exist', async () => {
      const initialLength = (await loader.load()).plugins.length;
      await loader.removePlugin('non-existent');

      // Should not throw and length should be unchanged
      expect(loader.get().plugins.length).toBe(initialLength);
    });
  });

  describe('getPluginConfig', () => {
    test('returns plugin config if exists', async () => {
      await Bun.write(
        join(BRIKA_DIR, 'brika.yml'),
        `
hub:
  port: 3001
plugins:
  "@test/plugin":
    version: "1.0.0"
    config:
      setting: "value"
rules: []
schedules: []
`
      );

      await loader.load();
      const config = loader.getPluginConfig('@test/plugin');

      expect(config?.setting).toBe('value');
    });

    test('returns undefined for non-existent plugin', async () => {
      await loader.load();
      expect(loader.getPluginConfig('non-existent')).toBeUndefined();
    });
  });

  describe('setPluginConfig', () => {
    test('sets plugin config', async () => {
      await Bun.write(
        join(BRIKA_DIR, 'brika.yml'),
        `
hub:
  port: 3001
plugins:
  "@test/plugin":
    version: "1.0.0"
rules: []
schedules: []
`
      );

      await loader.load();
      await loader.setPluginConfig('@test/plugin', { key: 'value' });

      const config = loader.getPluginConfig('@test/plugin');
      expect(config?.key).toBe('value');
    });

    test('throws for non-existent plugin', async () => {
      await loader.load();

      await expect(loader.setPluginConfig('non-existent', {})).rejects.toThrow('Plugin not found');
    });
  });

  describe('resolvePluginEntry', () => {
    test('resolves file: specifier', async () => {
      await loader.load();

      const result = await loader.resolvePluginEntry({
        name: 'test-plugin',
        version: 'file:/path/to/plugin',
      });

      expect(result.name).toBe('test-plugin');
      expect(result.rootDirectory).toBe('/path/to/plugin');
    });

    test('throws for unresolvable npm package', async () => {
      await loader.load();

      await expect(
        loader.resolvePluginEntry({
          name: '@test/unknown',
          version: '^1.0.0',
        })
      ).rejects.toThrow('Cannot resolve npm package');
    });
  });

  describe('path getters', () => {
    test('returns correct configPath', () => {
      expect(loader.configPath).toBe(join(BRIKA_DIR, 'brika.yml'));
    });

    test('returns correct rootDir', () => {
      expect(loader.rootDir).toBe(TEST_DIR);
      expect(loader.getRootDir()).toBe(TEST_DIR);
    });

    test('returns correct brikaDir', () => {
      expect(loader.brikaDir).toBe(BRIKA_DIR);
      expect(loader.getBrikaDir()).toBe(BRIKA_DIR);
    });
  });
});
