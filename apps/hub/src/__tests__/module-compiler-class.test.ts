/**
 * Tests for ModuleCompiler class methods: get(), getStyle(), remove()
 *
 * These are thin wrappers around the internal ModuleCache.
 * We verify correct behavior via the DI testbed by stubbing dependencies.
 */

import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get, provide, stub, useTestBed } from '@brika/di/testing';
import { ConfigLoader } from '@/runtime/config/config-loader';
import { Logger } from '@/runtime/logs/log-router';
import { ModuleCompiler } from '@/runtime/modules/module-compiler';

// ─── Temp directory for ModuleCache disk path (required by constructor) ──────

const TEST_DIR = join(tmpdir(), `brika-test-mc-${Date.now()}`);
const BRIKA_DIR = join(TEST_DIR, 'brika');

beforeAll(async () => {
  await mkdir(join(BRIKA_DIR, 'cache', 'modules'), { recursive: true });
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

// ─── get() ───────────────────────────────────────────────────────────────────

describe('ModuleCompiler - get()', () => {
  let compiler: ModuleCompiler;

  useTestBed({ autoStub: false }, () => {
    stub(Logger);
    provide(ConfigLoader, { brikaDir: BRIKA_DIR } as ConfigLoader);
    compiler = get(ModuleCompiler);
  });

  test('returns undefined for unknown key', () => {
    expect(compiler.get('nonexistent:module')).toBeUndefined();
  });

  test('returns undefined for partially matching key', () => {
    expect(compiler.get('plugin:')).toBeUndefined();
    expect(compiler.get(':module')).toBeUndefined();
  });

  test('returns undefined for empty string', () => {
    expect(compiler.get('')).toBeUndefined();
  });
});

// ─── getStyle() ──────────────────────────────────────────────────────────────

describe('ModuleCompiler - getStyle()', () => {
  let compiler: ModuleCompiler;

  useTestBed({ autoStub: false }, () => {
    stub(Logger);
    provide(ConfigLoader, { brikaDir: BRIKA_DIR } as ConfigLoader);
    compiler = get(ModuleCompiler);
  });

  test('returns undefined for unknown key', () => {
    expect(compiler.getStyle('nonexistent:module')).toBeUndefined();
  });

  test('returns undefined for empty string key', () => {
    expect(compiler.getStyle('')).toBeUndefined();
  });
});

// ─── remove() ────────────────────────────────────────────────────────────────

describe('ModuleCompiler - remove()', () => {
  let compiler: ModuleCompiler;

  useTestBed({ autoStub: false }, () => {
    stub(Logger);
    provide(ConfigLoader, { brikaDir: BRIKA_DIR } as ConfigLoader);
    compiler = get(ModuleCompiler);
  });

  test('does not throw when removing unknown plugin', () => {
    expect(() => compiler.remove('nonexistent-plugin')).not.toThrow();
  });

  test('does not throw when removing scoped plugin name', () => {
    expect(() => compiler.remove('@brika/weather')).not.toThrow();
  });

  test('does not throw when called multiple times', () => {
    expect(() => {
      compiler.remove('plugin-a');
      compiler.remove('plugin-a');
    }).not.toThrow();
  });
});

// ─── ModuleCache.loadFromDisk (tested via standalone instance) ───────────────

describe('ModuleCache - loadFromDisk', () => {
  const pluginName = 'disk-test-plugin';
  const moduleId = 'page';
  const hash = 'abc12345';
  const jsContent = 'export default 42;';
  const cssContent = '.page { color: red; }';

  beforeAll(async () => {
    const pluginDir = join(BRIKA_DIR, 'cache', 'modules', pluginName);
    await mkdir(pluginDir, { recursive: true });
    await Bun.write(join(pluginDir, `${moduleId}.${hash}.js`), jsContent);
    await Bun.write(join(pluginDir, `${moduleId}.${hash}.css`), cssContent);
  });

  test('returns true on cache hit and populates in-memory cache', async () => {
    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache(join(BRIKA_DIR, 'cache', 'modules'));

    const hit = await cache.loadFromDisk(pluginName, moduleId, hash);
    expect(hit).toBe(true);

    const js = cache.getJs(`${pluginName}:${moduleId}`);
    expect(js).toBeDefined();
    expect(js?.content).toBe(jsContent);
    expect(js?.etag).toMatch(/^"[0-9a-z]+"$/);

    const css = cache.getCss(`${pluginName}:${moduleId}`);
    expect(css).toBeDefined();
    expect(css?.content).toBe(cssContent);
    expect(css?.etag).toMatch(/^"[0-9a-z]+"$/);
  });

  test('returns false when hash does not match', async () => {
    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache(join(BRIKA_DIR, 'cache', 'modules'));

    const hit = await cache.loadFromDisk(pluginName, moduleId, 'wronghash');
    expect(hit).toBe(false);
  });

  test('returns false when plugin does not exist', async () => {
    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache(join(BRIKA_DIR, 'cache', 'modules'));

    const hit = await cache.loadFromDisk('no-plugin', 'no-module', 'deadbeef');
    expect(hit).toBe(false);
  });

  test('loadFromDisk without CSS file only loads JS', async () => {
    // Create a module with only JS, no CSS
    const jsOnlyPlugin = 'js-only';
    const jsOnlyDir = join(BRIKA_DIR, 'cache', 'modules', jsOnlyPlugin);
    await mkdir(jsOnlyDir, { recursive: true });
    await Bun.write(join(jsOnlyDir, `main.${hash}.js`), 'const x = 1;');

    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache(join(BRIKA_DIR, 'cache', 'modules'));

    const hit = await cache.loadFromDisk(jsOnlyPlugin, 'main', hash);
    expect(hit).toBe(true);

    expect(cache.getJs(`${jsOnlyPlugin}:main`)).toBeDefined();
    expect(cache.getCss(`${jsOnlyPlugin}:main`)).toBeUndefined();
  });
});

// ─── ModuleCache.writeToDisk ─────────────────────────────────────────────────

describe('ModuleCache - writeToDisk', () => {
  test('writes JS file to disk and can be read back', async () => {
    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache(join(BRIKA_DIR, 'cache', 'modules'));

    await cache.writeToDisk('write-test', 'mod', 'hash1', 'export const a = 1;');

    const jsFile = Bun.file(join(BRIKA_DIR, 'cache', 'modules', 'write-test', 'mod.hash1.js'));
    expect(await jsFile.exists()).toBe(true);
    expect(await jsFile.text()).toBe('export const a = 1;');
  });

  test('writes both JS and CSS files when CSS is provided', async () => {
    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache(join(BRIKA_DIR, 'cache', 'modules'));

    await cache.writeToDisk('write-test2', 'mod', 'hash2', 'js code', '.foo {}');

    const jsFile = Bun.file(join(BRIKA_DIR, 'cache', 'modules', 'write-test2', 'mod.hash2.js'));
    const cssFile = Bun.file(join(BRIKA_DIR, 'cache', 'modules', 'write-test2', 'mod.hash2.css'));

    expect(await jsFile.exists()).toBe(true);
    expect(await cssFile.exists()).toBe(true);
    expect(await cssFile.text()).toBe('.foo {}');
  });
});
