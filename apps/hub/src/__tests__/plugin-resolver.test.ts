/**
 * Tests for PluginResolver - plugin module resolution
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { BrikaError } from '@brika/ipc';
import { loadPluginPackageJson, PluginResolver } from '@/runtime/plugins/plugin-resolver';

const TEST_DIR = join(import.meta.dir, '.test-plugin-resolver');

describe('PluginResolver', () => {
  let resolver: PluginResolver;

  beforeAll(async () => {
    resolver = new PluginResolver();

    // Create test plugin directory structure
    await rm(TEST_DIR, {
      recursive: true,
      force: true,
    });
    await mkdir(TEST_DIR, {
      recursive: true,
    });
    await mkdir(join(TEST_DIR, 'valid-plugin'), {
      recursive: true,
    });
    await mkdir(join(TEST_DIR, 'no-main-plugin'), {
      recursive: true,
    });

    // Create valid plugin
    await Bun.write(
      join(TEST_DIR, 'valid-plugin', 'package.json'),
      JSON.stringify({
        name: '@test/valid-plugin',
        version: '1.0.0',
        main: './index.ts',
        engines: {
          brika: '^0.2.0',
        },
      })
    );
    await Bun.write(join(TEST_DIR, 'valid-plugin', 'index.ts'), 'export default {}');

    // Create plugin without main
    await Bun.write(
      join(TEST_DIR, 'no-main-plugin', 'package.json'),
      JSON.stringify({
        name: '@test/no-main-plugin',
        version: '1.0.0',
        engines: {
          brika: '^0.2.0',
        },
      })
    );
  });

  afterAll(async () => {
    await rm(TEST_DIR, {
      recursive: true,
      force: true,
    });
  });

  describe('resolve', () => {
    test('resolves plugin from absolute path', async () => {
      const result = await resolver.resolve(join(TEST_DIR, 'valid-plugin'));

      expect(result.metadata.name).toBe('@test/valid-plugin');
      expect(result.metadata.version).toBe('1.0.0');
      expect(result.entryPoint).toContain('index.ts');
      expect(result.rootDirectory).toContain('valid-plugin');
    });

    test('throws typed INVALID_INPUT when moduleId is empty', async () => {
      await expect(resolver.resolve('')).rejects.toMatchObject({
        code: 'INVALID_INPUT',
        data: { field: 'moduleId' },
      });
    });

    test('throws typed MANIFEST_MISSING_MAIN when package.json has no main', async () => {
      await expect(resolver.resolve(join(TEST_DIR, 'no-main-plugin'))).rejects.toMatchObject({
        code: 'MANIFEST_MISSING_MAIN',
        data: { pluginName: '@test/no-main-plugin' },
      });
    });

    test('lets the underlying Bun/import error surface for non-existent plugins', async () => {
      // No catch-all wrapper: callers see the real "Cannot find module" so
      // they can distinguish "wrong path" from "manifest is broken".
      await expect(resolver.resolve(join(TEST_DIR, 'non-existent'))).rejects.toThrow(
        /Cannot find module|ENOENT/
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

    test('throws typed MANIFEST_INVALID with issue list for bad package.json', async () => {
      // package.json has `main` but a wrong-shape field — exercises the
      // non-missing-main branch of the validator so we surface MANIFEST_INVALID
      // rather than MANIFEST_MISSING_MAIN.
      const invalidPath = join(TEST_DIR, 'invalid-package.json');
      await Bun.write(
        invalidPath,
        JSON.stringify({
          name: '@test/broken',
          version: 'not-a-version', // valid string, but the schema may accept it
          main: './index.ts',
          engines: { brika: 12345 }, // engines.brika must be a string
        })
      );

      try {
        await loadPluginPackageJson(invalidPath);
        throw new Error('expected throw');
      } catch (e) {
        expect(BrikaError.is(e, 'MANIFEST_INVALID')).toBe(true);
        if (BrikaError.is(e, 'MANIFEST_INVALID')) {
          expect(e.data?.pluginName).toBe('@test/broken');
          expect(e.data?.issues?.length).toBeGreaterThan(0);
          // ZodError survives as the cause for richer debugging.
          expect(e.cause).toBeDefined();
        }
      }
    });
  });
});
