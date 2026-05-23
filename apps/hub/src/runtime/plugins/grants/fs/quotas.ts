/**
 * Per-plugin disk quotas.
 *
 * In-memory counters track current usage per root. Writes check
 * `currentBytes + opBytes <= limit` before issuing the write; reads
 * have no quota effect. Deletes decrement.
 *
 * The counters are initialised by scanning the backing dir on first
 * use — operationally cheap because the dir is small (per-plugin), and
 * we cache the result for the process lifetime.
 *
 * What this is NOT: a hard disk-space enforcer at the filesystem
 * level. A plugin that legitimately writes a 5MB file then writes
 * another 5MB pays both. A plugin that overwrites the same 5MB file
 * sees the counter stay flat (we re-stat after the write). A plugin
 * that races multiple writes can briefly exceed by the size of one
 * outstanding op — acceptable for non-malicious throughput, and the
 * absolute cap is enforced by the rough check.
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { errors } from '@brika/errors';
import { DEFAULT_FS_QUOTAS, type FsBackingDirs, type FsQuotas } from './types';

type QuotaRoot = 'data' | 'cache' | 'tmp';

export class QuotaTracker {
  readonly #quotas: FsQuotas;
  readonly #counters: Record<QuotaRoot, number | null> = {
    data: null,
    cache: null,
    tmp: null,
  };

  constructor(quotas: FsQuotas = DEFAULT_FS_QUOTAS) {
    this.#quotas = quotas;
  }

  /**
   * Ensure the counter for `root` is initialised, then assert that
   * `delta` bytes can be added without exceeding the limit. Throws
   * `FS_QUOTA_EXCEEDED` on violation.
   */
  async assertCanAdd(root: QuotaRoot, delta: number, dirs: FsBackingDirs): Promise<void> {
    if (delta <= 0) {
      return;
    }
    const current = await this.#ensure(root, dirs);
    if (current + delta > this.#quotas[root]) {
      throw errors.fsQuotaExceeded({
        root: `/${root}`,
        limit: this.#quotas[root],
        requested: current + delta,
      });
    }
  }

  /** Increase the counter after a successful write. */
  add(root: QuotaRoot, delta: number): void {
    if (this.#counters[root] === null) {
      return;
    }
    this.#counters[root] = (this.#counters[root] ?? 0) + delta;
  }

  /** Decrease the counter after a successful delete. */
  subtract(root: QuotaRoot, delta: number): void {
    if (this.#counters[root] === null) {
      return;
    }
    this.#counters[root] = Math.max(0, (this.#counters[root] ?? 0) - delta);
  }

  /** Test hook: current usage for a root (initialises if needed). */
  async usage(root: QuotaRoot, dirs: FsBackingDirs): Promise<number> {
    return await this.#ensure(root, dirs);
  }

  async #ensure(root: QuotaRoot, dirs: FsBackingDirs): Promise<number> {
    const cached = this.#counters[root];
    if (cached !== null) {
      return cached;
    }
    const total = await scanDirSize(rootDir(root, dirs));
    this.#counters[root] = total;
    return total;
  }
}

function rootDir(root: QuotaRoot, dirs: FsBackingDirs): string {
  switch (root) {
    case 'data':
      return dirs.data;
    case 'cache':
      return dirs.cache;
    case 'tmp':
      return dirs.tmp;
  }
}

/**
 * Walk a directory and sum every regular file's size. Symlinks are
 * NOT followed — they're stat'd in-place so a malicious symlink can't
 * make the counter wrap.
 */
export async function scanDirSize(dir: string): Promise<number> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return 0;
  }
  let total = 0;
  for (const name of names) {
    const full = join(dir, name);
    try {
      const s = await stat(full);
      if (s.isFile()) {
        total += s.size;
      } else if (s.isDirectory()) {
        total += await scanDirSize(full);
      }
    } catch {
      // Ignore individual entry failures (race with concurrent rm).
    }
  }
  return total;
}
