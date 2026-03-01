/**
 * Tests for the Storage API.
 *
 * Creates a temporary fixture plugin directory and verifies that
 * readJSON, writeJSON, deleteJSON, exists, getDataDir, and clearAllData
 * work correctly.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import {
  clearAllData,
  defineStore,
  deleteJSON,
  exists,
  getDataDir,
  readJSON,
  updateJSON,
  writeJSON,
} from '../api/storage';

// ─── Fixture Setup ───────────────────────────────────────────────────────────

const fixtureDir = '/tmp/brika-test-storage-plugin';
const fixturePackageJson = `${fixtureDir}/package.json`;
const origBunMain = Bun.main;

beforeAll(() => {
  if (!existsSync(fixtureDir)) {
    mkdirSync(fixtureDir, {
      recursive: true,
    });
  }
  if (!existsSync(`${fixtureDir}/src`)) {
    mkdirSync(`${fixtureDir}/src`, {
      recursive: true,
    });
  }
  writeFileSync(
    fixturePackageJson,
    JSON.stringify(
      {
        name: 'test-storage-plugin',
        version: '1.0.0',
      },
      null,
      2
    )
  );
  (
    Bun as {
      main: string;
    }
  ).main = `${fixtureDir}/src/index.ts`;
});

afterEach(() => {
  // Clean up data dir between tests
  const dataDir = `${fixtureDir}/data`;
  if (existsSync(dataDir)) {
    rmSync(dataDir, {
      recursive: true,
      force: true,
    });
  }
});

afterAll(() => {
  (
    Bun as {
      main: string;
    }
  ).main = origBunMain;
  if (existsSync(fixtureDir)) {
    rmSync(fixtureDir, {
      recursive: true,
      force: true,
    });
  }
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('getDataDir', () => {
  test('returns the data directory path inside the plugin root', () => {
    const dir = getDataDir();
    expect(dir).toBe(`${fixtureDir}/data`);
  });

  test('creates the directory if it does not exist', () => {
    expect(existsSync(`${fixtureDir}/data`)).toBe(false);
    getDataDir();
    expect(existsSync(`${fixtureDir}/data`)).toBe(true);
  });
});

describe('writeJSON + readJSON', () => {
  test('round-trips a JSON value', async () => {
    const data = {
      version: 1,
      nodes: ['a', 'b'],
    };
    await writeJSON('config', data);
    const result = await readJSON<typeof data>('config');
    expect(result).toEqual(data);
  });

  test('supports nested keys', async () => {
    await writeJSON('matter/fabric', {
      fabricId: 'abc',
    });
    const result = await readJSON<{
      fabricId: string;
    }>('matter/fabric');
    expect(result).toEqual({
      fabricId: 'abc',
    });
  });

  test('overwrites existing value', async () => {
    await writeJSON('config', {
      v: 1,
    });
    await writeJSON('config', {
      v: 2,
    });
    const result = await readJSON<{
      v: number;
    }>('config');
    expect(result).toEqual({
      v: 2,
    });
  });
});

describe('readJSON', () => {
  test('returns null for non-existent key', async () => {
    const result = await readJSON('nonexistent');
    expect(result).toBeNull();
  });
});

describe('deleteJSON', () => {
  test('removes the file', async () => {
    await writeJSON('to-delete', {
      x: 1,
    });
    expect(await exists('to-delete')).toBe(true);
    await deleteJSON('to-delete');
    expect(await exists('to-delete')).toBe(false);
  });

  test('does not throw for non-existent key', async () => {
    await deleteJSON('never-existed');
  });
});

describe('exists', () => {
  test('returns true for existing key', async () => {
    await writeJSON('check-me', true);
    expect(await exists('check-me')).toBe(true);
  });

  test('returns false for missing key', async () => {
    expect(await exists('missing')).toBe(false);
  });
});

describe('clearAllData', () => {
  test('removes the entire data directory', async () => {
    await writeJSON('a', 1);
    await writeJSON('b/c', 2);
    expect(existsSync(`${fixtureDir}/data`)).toBe(true);
    clearAllData();
    expect(existsSync(`${fixtureDir}/data`)).toBe(false);
  });
});

describe('updateJSON', () => {
  test('creates value from default when key missing', async () => {
    const result = await updateJSON<string[]>('items', (items) => [...items, 'a'], []);
    expect(result).toEqual(['a']);
    expect(await readJSON<string[]>('items')).toEqual(['a']);
  });

  test('updates existing value', async () => {
    await writeJSON('counter', {
      n: 5,
    });
    const result = await updateJSON<{
      n: number;
    }>(
      'counter',
      (c) => ({
        n: c.n + 1,
      }),
      {
        n: 0,
      }
    );
    expect(result).toEqual({
      n: 6,
    });
  });
});

describe('defineStore', () => {
  test('load reads persisted data', async () => {
    await writeJSON('my-store', {
      count: 42,
    });
    const store = defineStore('my-store', {
      count: 0,
    });
    await store.load();
    expect(store.get()).toEqual({
      count: 42,
    });
  });

  test('load uses default when no data exists', async () => {
    const store = defineStore('empty-store', {
      items: [] as string[],
    });
    await store.load();
    expect(store.get()).toEqual({
      items: [],
    });
  });

  test('get throws before load', () => {
    const store = defineStore('not-loaded', {
      x: 1,
    });
    expect(() => store.get()).toThrow('not loaded');
  });

  test('set persists to disk', async () => {
    const store = defineStore('set-test', {
      v: 0,
    });
    await store.load();
    await store.set({
      v: 99,
    });
    expect(store.get()).toEqual({
      v: 99,
    });
    // Verify it was actually written to disk
    expect(
      await readJSON<{
        v: number;
      }>('set-test')
    ).toEqual({
      v: 99,
    });
  });

  test('update applies function and persists', async () => {
    const store = defineStore('update-test', {
      n: 10,
    });
    await store.load();
    await store.update((s) => ({
      n: s.n * 2,
    }));
    expect(store.get()).toEqual({
      n: 20,
    });
    expect(
      await readJSON<{
        n: number;
      }>('update-test')
    ).toEqual({
      n: 20,
    });
  });

  test('clear resets to default and deletes file', async () => {
    const store = defineStore('clear-test', {
      x: 'default',
    });
    await store.load();
    await store.set({
      x: 'modified',
    });
    await store.clear();
    expect(store.get()).toEqual({
      x: 'default',
    });
    expect(await exists('clear-test')).toBe(false);
  });
});

describe('key validation', () => {
  test('rejects keys with path traversal', () => {
    expect(readJSON('../escape')).rejects.toThrow('Path traversal');
  });

  test('rejects keys with invalid characters', () => {
    expect(readJSON('bad key!')).rejects.toThrow('Invalid storage key');
  });

  test('accepts valid keys', async () => {
    await writeJSON('valid-key_1.0/nested', 'ok');
    expect(await readJSON<string>('valid-key_1.0/nested')).toBe('ok');
  });
});
