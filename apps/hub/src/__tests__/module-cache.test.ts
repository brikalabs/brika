/**
 * Tests for ModuleCache — metadata-only in-memory map (get, store, remove)
 * and the content hash helper function.
 *
 * JS content is stored on disk only; in-memory entries hold just the
 * content hash (for URL cache-busting) and the file path (for serving).
 *
 * Disk integration (loadFromDisk, store) uses a real temp directory.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModuleCache } from '@/runtime/modules/module-cache';

const TEST_DIR = join(tmpdir(), `brika-test-mc-${Date.now()}`);

beforeAll(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

// ─── store and get ───────────────────────────────────────────────────────────

describe('ModuleCache - store and get', () => {
  test('returns undefined for unknown key', () => {
    const cache = new ModuleCache();
    expect(cache.get('unknown:key')).toBeUndefined();
  });

  test('stores metadata and writes JS to disk', async () => {
    const cache = new ModuleCache();
    const dir = join(TEST_DIR, 'store-basic');

    await cache.store('plugin:module', dir, 'module', 'h1', 'console.log("hello")');

    const entry = cache.get('plugin:module');
    expect(entry).toBeDefined();
    expect(entry?.filePath).toBe(join(dir, 'module.h1.js'));
    expect(await Bun.file(entry?.filePath ?? '').text()).toBe('console.log("hello")');
  });

  test('generates a content hash', async () => {
    const cache = new ModuleCache();
    const dir = join(TEST_DIR, 'store-hash');

    await cache.store('plugin:module', dir, 'module', 'h1', 'const x = 1;');

    const entry = cache.get('plugin:module');
    expect(entry?.hash).toBeDefined();
    expect(entry?.hash).toMatch(/^[0-9a-z]+$/);
  });

  test('different content produces different hashes', async () => {
    const cache = new ModuleCache();
    const dir = join(TEST_DIR, 'store-diff');

    await cache.store('plugin:a', dir, 'a', 'h1', 'const a = 1;');
    await cache.store('plugin:b', dir, 'b', 'h2', 'const b = 2;');

    const hashA = cache.get('plugin:a')?.hash;
    const hashB = cache.get('plugin:b')?.hash;

    expect(hashA).not.toBe(hashB);
  });

  test('same content produces same hash', async () => {
    const cache = new ModuleCache();
    const dir = join(TEST_DIR, 'store-same');
    const content = 'export default function() {}';

    await cache.store('plugin:a', dir, 'a', 'h1', content);
    await cache.store('plugin:b', dir, 'b', 'h2', content);

    expect(cache.get('plugin:a')?.hash).toBe(cache.get('plugin:b')?.hash);
  });

  test('overwrites existing entry with store()', async () => {
    const cache = new ModuleCache();
    const dir = join(TEST_DIR, 'store-overwrite');

    await cache.store('plugin:module', dir, 'module', 'h1', 'const old = true;');
    await cache.store('plugin:module', dir, 'module', 'h2', 'const new_ = true;');

    const entry = cache.get('plugin:module');
    expect(await Bun.file(entry?.filePath ?? '').text()).toBe('const new_ = true;');
  });
});

// ─── remove ──────────────────────────────────────────────────────────────────

describe('ModuleCache - remove', () => {
  test('removes all entries for a plugin prefix', async () => {
    const cache = new ModuleCache();
    const dir = join(TEST_DIR, 'remove-prefix');

    await cache.store('my-plugin:page1', dir, 'page1', 'h1', 'js1');
    await cache.store('my-plugin:page2', dir, 'page2', 'h2', 'js2');
    await cache.store('other-plugin:page1', dir, 'page3', 'h3', 'js3');

    cache.remove('my-plugin');

    expect(cache.get('my-plugin:page1')).toBeUndefined();
    expect(cache.get('my-plugin:page2')).toBeUndefined();
  });

  test('does not affect entries from other plugins', async () => {
    const cache = new ModuleCache();
    const dir = join(TEST_DIR, 'remove-other');

    await cache.store('plugin-a:module', dir, 'a', 'h1', 'js-a');
    await cache.store('plugin-b:module', dir, 'b', 'h2', 'js-b');

    cache.remove('plugin-a');

    expect(cache.get('plugin-a:module')).toBeUndefined();
    expect(cache.get('plugin-b:module')).toBeDefined();
  });

  test('handles removing a plugin with no cached entries', () => {
    const cache = new ModuleCache();
    cache.remove('nonexistent-plugin');
  });

  test('removes entries even when plugin name is a prefix of another', async () => {
    const cache = new ModuleCache();
    const dir = join(TEST_DIR, 'remove-prefix-safe');

    await cache.store('timer:page', dir, 'page', 'h1', 'js1');
    await cache.store('timer-pro:page', dir, 'page-pro', 'h2', 'js2');

    cache.remove('timer');

    expect(cache.get('timer:page')).toBeUndefined();
    expect(cache.get('timer-pro:page')).toBeDefined();
  });

  test('can re-add entries after remove', async () => {
    const cache = new ModuleCache();
    const dir = join(TEST_DIR, 'remove-readd');

    await cache.store('plugin:module', dir, 'module', 'h1', 'js-old');
    cache.remove('plugin');

    expect(cache.get('plugin:module')).toBeUndefined();

    await cache.store('plugin:module', dir, 'module', 'h2', 'js-new');
    const entry = cache.get('plugin:module');
    expect(await Bun.file(entry?.filePath ?? '').text()).toBe('js-new');
  });
});

// ─── multiple modules per plugin ─────────────────────────────────────────────

describe('ModuleCache - multiple modules per plugin', () => {
  test('stores multiple modules independently', async () => {
    const cache = new ModuleCache();
    const dir = join(TEST_DIR, 'multi-mod');

    await cache.store('plugin:settings', dir, 'settings', 'h1', 'settings js');
    await cache.store('plugin:dashboard', dir, 'dashboard', 'h2', 'dashboard js');

    const settingsEntry = cache.get('plugin:settings');
    const dashboardEntry = cache.get('plugin:dashboard');
    expect(await Bun.file(settingsEntry?.filePath ?? '').text()).toBe('settings js');
    expect(await Bun.file(dashboardEntry?.filePath ?? '').text()).toBe('dashboard js');
  });

  test('updating one module does not affect another', async () => {
    const cache = new ModuleCache();
    const dir = join(TEST_DIR, 'multi-update');

    await cache.store('plugin:a', dir, 'a', 'h1', 'js-a');
    await cache.store('plugin:b', dir, 'b', 'h2', 'js-b');
    await cache.store('plugin:a', dir, 'a', 'h3', 'js-a-updated');

    const entryA = cache.get('plugin:a');
    const entryB = cache.get('plugin:b');
    expect(await Bun.file(entryA?.filePath ?? '').text()).toBe('js-a-updated');
    expect(await Bun.file(entryB?.filePath ?? '').text()).toBe('js-b');
  });
});

// ─── edge cases ──────────────────────────────────────────────────────────────

describe('ModuleCache - edge cases', () => {
  test('handles empty string content', async () => {
    const cache = new ModuleCache();
    const dir = join(TEST_DIR, 'edge-empty');

    await cache.store('plugin:empty', dir, 'empty', 'h1', '');

    const entry = cache.get('plugin:empty');
    expect(entry?.hash).toBeDefined();
    expect(await Bun.file(entry?.filePath ?? '').text()).toBe('');
  });

  test('handles scoped package names in keys', async () => {
    const cache = new ModuleCache();
    const dir = join(TEST_DIR, 'edge-scoped');

    await cache.store('@brika/weather:settings', dir, 'settings', 'h1', 'scoped js');

    const entry = cache.get('@brika/weather:settings');
    expect(await Bun.file(entry?.filePath ?? '').text()).toBe('scoped js');
  });

  test('remove works with scoped package names', async () => {
    const cache = new ModuleCache();
    const dir = join(TEST_DIR, 'edge-scoped-remove');

    await cache.store('@brika/weather:settings', dir, 'settings', 'h1', 'js1');
    await cache.store('@brika/weather:dashboard', dir, 'dashboard', 'h2', 'js2');
    await cache.store('@brika/timer:settings', dir, 'timer-settings', 'h3', 'js3');

    cache.remove('@brika/weather');

    expect(cache.get('@brika/weather:settings')).toBeUndefined();
    expect(cache.get('@brika/weather:dashboard')).toBeUndefined();
    expect(cache.get('@brika/timer:settings')).toBeDefined();
  });
});

// ─── loadFromDisk ────────────────────────────────────────────────────────────

describe('ModuleCache - loadFromDisk', () => {
  const moduleId = 'page';
  const hash = 'abc12345';
  const jsContent = 'export default 42;';
  const diskDir = join(TEST_DIR, 'load-disk-test');

  beforeAll(async () => {
    await mkdir(diskDir, { recursive: true });
    await Bun.write(join(diskDir, `${moduleId}.${hash}.js`), jsContent);
  });

  test('returns true on cache hit and populates in-memory metadata', async () => {
    const cache = new ModuleCache();

    const hit = await cache.loadFromDisk(diskDir, 'test:page', moduleId, hash);
    expect(hit).toBe(true);

    const entry = cache.get('test:page');
    expect(entry).toBeDefined();
    expect(entry?.hash).toMatch(/^[0-9a-z]+$/);
    expect(entry?.filePath).toBe(join(diskDir, `${moduleId}.${hash}.js`));
  });

  test('returns false when hash does not match', async () => {
    const cache = new ModuleCache();

    const hit = await cache.loadFromDisk(diskDir, 'test:page', moduleId, 'wronghash');
    expect(hit).toBe(false);
  });

  test('returns false when plugin does not exist', async () => {
    const cache = new ModuleCache();

    const hit = await cache.loadFromDisk('/nonexistent', 'test:no', 'no-module', 'deadbeef');
    expect(hit).toBe(false);
  });
});
