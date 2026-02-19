/**
 * Storage API
 *
 * Persistent file-based storage for plugins.
 * Data is stored in a `data/` subfolder of the plugin's package directory.
 * Does NOT use IPC — direct filesystem access from the plugin process.
 *
 * @example
 * ```typescript
 * import { getDataDir, readJSON, writeJSON } from '@brika/sdk/storage';
 *
 * // JSON key-value storage
 * await writeJSON('config', { version: 1, nodes: [] });
 * const config = await readJSON<{ version: number }>('config');
 *
 * // Raw file access for libraries that manage their own files
 * const storagePath = getDataDir();
 * ```
 */

import { existsSync, mkdirSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { getPluginRootDirectory } from '../context/manifest';

// ─── Internal ────────────────────────────────────────────────────────────────

function resolveDataDir(): string {
  return join(getPluginRootDirectory(), 'data');
}

function ensureDataDir(): string {
  const dataDir = resolveDataDir();
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  return dataDir;
}

function resolveJsonPath(key: string): string {
  if (!/^[\w.\-/]+$/.test(key)) {
    throw new Error(
      `Invalid storage key "${key}". Use alphanumeric, hyphens, underscores, dots, slashes only.`
    );
  }
  if (key.includes('..')) {
    throw new Error(`Invalid storage key "${key}". Path traversal ("..") is not allowed.`);
  }
  return join(ensureDataDir(), `${key}.json`);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get the absolute path to the plugin's `data/` directory.
 * Creates the directory if it doesn't exist yet.
 *
 * Use this for raw file access when libraries need a storage path
 * (e.g. matter.js node storage, SQLite databases).
 */
export function getDataDir(): string {
  return ensureDataDir();
}

/**
 * Read a JSON value from persistent storage.
 *
 * @param key Storage key (becomes `data/<key>.json`). Supports nested paths like `matter/fabric`.
 * @returns The parsed value, or `null` if the key doesn't exist or contains invalid JSON.
 * @throws {Error} if the key contains invalid characters or path traversal (`..`).
 */
export async function readJSON<T = unknown>(key: string): Promise<T | null> {
  const path = resolveJsonPath(key);
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  try {
    return (await file.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Write a JSON value to persistent storage.
 *
 * @param key Storage key (becomes `data/<key>.json`). Supports nested paths like `matter/fabric`.
 * @param value Any JSON-serializable value.
 * @throws {Error} if the key contains invalid characters or path traversal (`..`).
 */
export async function writeJSON(key: string, value: unknown): Promise<void> {
  const path = resolveJsonPath(key);
  const parentDir = path.substring(0, path.lastIndexOf('/'));
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }
  await Bun.write(path, JSON.stringify(value, null, 2));
}

/**
 * Delete a JSON value from persistent storage.
 *
 * @param key Storage key to delete.
 */
export function deleteJSON(key: string): Promise<void> {
  const path = resolveJsonPath(key);
  try {
    unlinkSync(path);
  } catch {
    // Ignore if file doesn't exist
  }
  return Promise.resolve();
}

/**
 * Check if a JSON key exists in persistent storage.
 *
 * @param key Storage key to check.
 */
export function exists(key: string): Promise<boolean> {
  const path = resolveJsonPath(key);
  return Bun.file(path).exists();
}

/**
 * Read-modify-write a JSON value in one call.
 *
 * @param key Storage key.
 * @param updater Receives the current value (or `defaultValue` if missing) and returns the new value.
 * @param defaultValue Fallback when the key doesn't exist yet.
 */
export async function updateJSON<T>(
  key: string,
  updater: (current: T) => T,
  defaultValue: T
): Promise<T> {
  const current = (await readJSON<T>(key)) ?? defaultValue;
  const next = updater(current);
  await writeJSON(key, next);
  return next;
}

/**
 * Remove the entire plugin data directory.
 * Intended for use in `onUninstall` cleanup handlers.
 */
export function clearAllData(): void {
  const dataDir = resolveDataDir();
  if (existsSync(dataDir)) {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

// ─── defineStore ─────────────────────────────────────────────────────────────

/** Typed persistent store with in-memory caching and automatic disk writes. */
export interface Store<T> {
  /** Load state from disk into memory. Call once during `onInit`. */
  load(): Promise<void>;
  /** Synchronous read of the cached state. */
  get(): T;
  /** Replace state and persist to disk. */
  set(value: T): Promise<void>;
  /** Read-modify-write and persist to disk. */
  update(fn: (prev: T) => T): Promise<void>;
  /** Delete persisted data and reset to default. */
  clear(): Promise<void>;
}

/**
 * Define a typed persistent store backed by a JSON file.
 *
 * Combines the convenience of `defineSharedStore` (sync reads, typed)
 * with automatic disk persistence.
 *
 * @param key Storage key (becomes `data/<key>.json`).
 * @param defaultValue Initial value used when no persisted data exists.
 *
 * @example
 * ```typescript
 * import { defineStore } from '@brika/sdk/storage';
 * import { onInit } from '@brika/sdk/lifecycle';
 *
 * const devices = defineStore('devices', { list: [] as string[] });
 *
 * onInit(async () => {
 *   await devices.load();            // read from disk
 *   console.log(devices.get().list);  // sync access
 * });
 *
 * // later — update + auto-persist
 * await devices.update(s => ({ ...s, list: [...s.list, 'new-node'] }));
 * ```
 */
export function defineStore<T>(key: string, defaultValue: T): Store<T> {
  let state: T = defaultValue;
  let loaded = false;

  return {
    async load() {
      state = (await readJSON<T>(key)) ?? defaultValue;
      loaded = true;
    },

    get() {
      if (!loaded) {
        throw new Error(`Store "${key}" not loaded. Call store.load() in onInit before reading.`);
      }
      return state;
    },

    async set(value: T) {
      state = value;
      loaded = true;
      await writeJSON(key, state);
    },

    async update(fn: (prev: T) => T) {
      state = fn(state);
      loaded = true;
      await writeJSON(key, state);
    },

    async clear() {
      state = defaultValue;
      loaded = true;
      await deleteJSON(key);
    },
  };
}
