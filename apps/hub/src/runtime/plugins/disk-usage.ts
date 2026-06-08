import { inject, singleton } from '@brika/di';
import type { Plugin } from '@brika/plugin';
import { BrikaInitializer } from '@/runtime/config/brika-initializer';
import { pluginFsDirs } from './fs-dirs';
import { scanDirSize } from './grants/fs/quotas';
import { resolveFsQuotas } from './grants/fs/types';
import { PluginLifecycle } from './plugin-lifecycle';

interface RootUsage {
  /** Bytes currently on disk under this root. */
  readonly used: number;
  /** Quota ceiling in bytes for this root. */
  readonly limit: number;
}

export interface PluginDiskUsage {
  readonly data: RootUsage;
  readonly cache: RootUsage;
  readonly tmp: RootUsage;
  readonly total: RootUsage;
  /** Whether the plugin is running — limits then reflect its manifest. */
  readonly running: boolean;
}

interface CacheEntry {
  readonly value: { data: number; cache: number; tmp: number };
  readonly expiresAt: number;
}

const TTL_MS = 10_000;

/**
 * Computes and caches per-plugin disk usage for the detail-page stats card.
 *
 * Scanning a plugin's data tree is O(files), so the byte totals are memoised
 * per uid for a short TTL — repeated card views (and its refetch interval) are
 * then O(1). The map is keyed by uid and bounded by the plugin count, so TTL
 * expiry is the only eviction needed.
 *
 * Works whether or not the plugin is running: the backing dirs resolve
 * deterministically from `<brikaDir>/plugins/data/<uid>/`. Quota limits come
 * from the running process's manifest when available, else the hub defaults.
 */
@singleton()
export class DiskUsageCache {
  readonly #lifecycle = inject(PluginLifecycle);
  readonly #brikaInit = inject(BrikaInitializer);
  readonly #cache = new Map<string, CacheEntry>();

  async get(plugin: Plugin): Promise<PluginDiskUsage> {
    const process = this.#lifecycle.getProcess(plugin.name);
    const limits = resolveFsQuotas(process?.metadata.resources?.fs?.quotas);
    const used = await this.#usedBytes(plugin);
    return {
      data: { used: used.data, limit: limits.data },
      cache: { used: used.cache, limit: limits.cache },
      tmp: { used: used.tmp, limit: limits.tmp },
      total: {
        used: used.data + used.cache + used.tmp,
        limit: limits.data + limits.cache + limits.tmp,
      },
      running: Boolean(process),
    };
  }

  /** Drop a plugin's cached totals — e.g. after a delete/uninstall. */
  invalidate(uid: string): void {
    this.#cache.delete(uid);
  }

  async #usedBytes(plugin: Plugin): Promise<{ data: number; cache: number; tmp: number }> {
    const hit = this.#cache.get(plugin.uid);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value;
    }
    const dirs = pluginFsDirs(this.#brikaInit.brikaDir, plugin.uid, plugin.rootDirectory);
    const [data, cache, tmp] = await Promise.all([
      scanDirSize(dirs.data),
      scanDirSize(dirs.cache),
      scanDirSize(dirs.tmp),
    ]);
    const value = { data, cache, tmp };
    this.#cache.set(plugin.uid, { value, expiresAt: Date.now() + TTL_MS });
    return value;
  }
}
