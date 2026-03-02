/**
 * Tests for ModuleCompiler class methods: get(), remove()
 *
 * These are thin wrappers around the internal ModuleCache.
 * We verify correct behavior via the DI testbed by stubbing dependencies.
 */

import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { get, stub, useTestBed } from '@brika/di/testing';
import { Logger } from '@/runtime/logs/log-router';
import { ModuleCompiler } from '@/runtime/modules/module-compiler';

// ─── Temp directory for ModuleCache disk path ────────────────────────────────

const TEST_DIR = join(tmpdir(), `brika-test-mc-${Date.now()}`);
const CACHE_DIR = join(TEST_DIR, 'node_modules', '.cache', 'brika');

beforeAll(async () => {
  await mkdir(CACHE_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

// ─── get() ───────────────────────────────────────────────────────────────────

describe('ModuleCompiler - get()', () => {
  let compiler: ModuleCompiler;

  useTestBed(
    { autoStub: false },
    () => {
      stub(Logger);
      compiler = get(ModuleCompiler);
    }
  );

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

// ─── remove() ────────────────────────────────────────────────────────────────

describe('ModuleCompiler - remove()', () => {
  let compiler: ModuleCompiler;

  useTestBed(
    { autoStub: false },
    () => {
      stub(Logger);
      compiler = get(ModuleCompiler);
    }
  );

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
  const moduleId = 'page';
  const hash = 'abc12345';
  const jsContent = 'export default 42;';
  const memKey = 'disk-test-plugin:page';

  beforeAll(async () => {
    await mkdir(CACHE_DIR, { recursive: true });
    await Bun.write(join(CACHE_DIR, `${moduleId}.${hash}.js`), jsContent);
  });

  test('returns true on cache hit and populates in-memory metadata', async () => {
    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache();

    const hit = await cache.loadFromDisk(CACHE_DIR, memKey, moduleId, hash);
    expect(hit).toBe(true);

    const entry = cache.get(memKey);
    expect(entry).toBeDefined();
    expect(entry?.filePath).toBe(join(CACHE_DIR, `${moduleId}.${hash}.js`));
    expect(entry?.hash).toMatch(/^[0-9a-z]+$/);
  });

  test('returns false when hash does not match', async () => {
    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache();

    const hit = await cache.loadFromDisk(CACHE_DIR, 'test:page', moduleId, 'wronghash');
    expect(hit).toBe(false);
  });

  test('returns false when plugin does not exist', async () => {
    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache();

    const hit = await cache.loadFromDisk('/nonexistent/path', 'test:no-module', 'no-module', 'deadbeef');
    expect(hit).toBe(false);
  });
});

// ─── ModuleCache.store ──────────────────────────────────────────────────────

describe('ModuleCache - store', () => {
  test('writes JS file to disk and populates in-memory metadata', async () => {
    const { ModuleCache } = await import('@/runtime/modules/module-cache');
    const cache = new ModuleCache();
    const writeDir = join(TEST_DIR, 'write-test');

    await cache.store('test:mod', writeDir, 'mod', 'hash1', 'export const a = 1;');

    const jsFile = Bun.file(join(writeDir, 'mod.hash1.js'));
    expect(await jsFile.exists()).toBe(true);
    expect(await jsFile.text()).toBe('export const a = 1;');

    const entry = cache.get('test:mod');
    expect(entry).toBeDefined();
    expect(entry?.filePath).toBe(join(writeDir, 'mod.hash1.js'));
  });
});
