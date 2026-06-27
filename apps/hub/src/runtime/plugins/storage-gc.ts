/**
 * Garbage-collect per-plugin evictable storage. Each plugin's `/cache` and
 * `/tmp` roots are spec'd as disposable, but nothing reclaimed them, so a
 * long-running hub accumulated dead files until the plugin was uninstalled.
 * This ages them out: `/tmp` aggressively (short-lived scratch), `/cache` more
 * leniently (worth keeping warm for a while). Persistent `/data` is never touched.
 */

import { lstat, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pluginDataDir } from './fs-dirs';

/** `/tmp` is short-lived scratch: anything older than a day is fair game. */
export const TMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** `/cache` is worth keeping warm longer, but not forever. */
export const CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface StorageGcResult {
  freedBytes: number;
  removedFiles: number;
  sweptPlugins: number;
}

/**
 * Recursively delete files with `mtime < cutoff` under `dir`. Symlinks are
 * `lstat`'d in place (never followed), mirroring the quota walker, so a
 * malicious link can't trick the GC into deleting outside the tree. Best-effort:
 * individual failures (races with a running plugin) are skipped.
 */
async function sweepOldFiles(
  dir: string,
  cutoff: number,
  acc: { freedBytes: number; removedFiles: number }
): Promise<void> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return; // dir doesn't exist (plugin never used this root) — nothing to do.
  }
  for (const name of names) {
    const full = join(dir, name);
    try {
      const stats = await lstat(full);
      if (stats.isDirectory()) {
        await sweepOldFiles(full, cutoff, acc);
      } else if (stats.isFile() && stats.mtimeMs < cutoff) {
        await rm(full, { force: true });
        acc.freedBytes += stats.size;
        acc.removedFiles += 1;
      }
    } catch {
      // Ignore individual entry failures (race with a concurrent write/rm).
    }
  }
}

/**
 * Sweep every plugin's `/cache` and `/tmp` under `<systemDir>/plugins/data/<uid>/`,
 * deleting files past their max age. Returns what was reclaimed. Never throws.
 */
export async function gcPluginStorage(
  systemDir: string,
  now: number,
  ages: { tmpMaxAgeMs: number; cacheMaxAgeMs: number } = {
    tmpMaxAgeMs: TMP_MAX_AGE_MS,
    cacheMaxAgeMs: CACHE_MAX_AGE_MS,
  }
): Promise<StorageGcResult> {
  const root = pluginDataDir(systemDir);
  const acc = { freedBytes: 0, removedFiles: 0 };
  let sweptPlugins = 0;
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return { ...acc, sweptPlugins: 0 }; // no plugin-data dir yet.
  }
  for (const uid of entries) {
    const base = join(root, uid);
    try {
      if (!(await lstat(base)).isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }
    await sweepOldFiles(join(base, 'tmp'), now - ages.tmpMaxAgeMs, acc);
    await sweepOldFiles(join(base, 'cache'), now - ages.cacheMaxAgeMs, acc);
    sweptPlugins += 1;
  }
  return { ...acc, sweptPlugins };
}
