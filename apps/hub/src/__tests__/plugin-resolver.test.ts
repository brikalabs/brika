/**
 * Tests for PluginResolver - plugin module resolution
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadPluginPackageJson, PluginResolver } from '@/runtime/plugins/plugin-resolver';

const TEST_DIR = join(import.meta.dir, '.test-plugin-resolver');

describe('PluginResolver', () => {
  let resolver: PluginResolver;

  beforeAll(async () => {
    resolver = new PluginResolver();

    // Create test plugin directory structure
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });
    await mkdir(join(TEST_DIR, 'valid-plugin'), { recursive: true });
    await mkdir(join(TEST_DIR, 'no-main-plugin'), { recursive: true });

    // Create valid plugin
    await Bun.write(
      join(TEST_DIR, 'valid-plugin', 'package.json'),
      JSON.stringify({
        name: '@test/valid-plugin',
        version: '1.0.0',
        main: './index.ts',
        engines: { brika: '^0.2.0' },
      })
    );
    await Bun.write(join(TEST_DIR, 'valid-plugin', 'index.ts'), 'export default {}');

    // Create plugin without main
    await Bun.write(
      join(TEST_DIR, 'no-main-plugin', 'package.json'),
      JSON.stringify({
        name: '@test/no-main-plugin',
        version: '1.0.0',
        engines: { brika: '^0.2.0' },
      })
    );
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('resolve', () => {
    test('resolves plugin from absolute path', async () => {
      const result = await resolver.resolve(join(TEST_DIR, 'valid-plugin'));

      expect(result.metadata.name).toBe('@test/valid-plugin');
      expect(result.metadata.version).toBe('1.0.0');
      expect(result.entryPoint).toContain('index.ts');
      expect(result.rootDirectory).toContain('valid-plugin');
    });

    test('throws when moduleId is empty', async () => {
      await expect(resolver.resolve('')).rejects.toThrow('moduleId is required');
    });

    test('throws when plugin has no main field', async () => {
      await expect(resolver.resolve(join(TEST_DIR, 'no-main-plugin'))).rejects.toThrow(
        'must have a "main" field'
      );
    });

    test('throws for non-existent plugin', async () => {
      await expect(resolver.resolve(join(TEST_DIR, 'non-existent'))).rejects.toThrow(
        'Failed to resolve plugin'
      );
    });
  });

  describe('loadPluginPackageJson', () => {
    test('loads and validates package.json', async () => {
      const packageJsonPath = join(TEST_DIR, 'valid-plugin', 'package.json');
      const metadata = await loadPluginPackageJson(packageJsonPath);

      expect(metadata.name).toBe('@test/valid-plugin');
      expect(metadata.version).toBe('1.0.0');
    });

    test('throws for invalid package.json', async () => {
      // Create invalid package.json
      const invalidPath = join(TEST_DIR, 'invalid-package.json');
      await Bun.write(invalidPath, JSON.stringify({ invalid: true }));

      await expect(loadPluginPackageJson(invalidPath)).rejects.toThrow();
    });
  });
});
