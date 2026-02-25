/**
 * Cache Bootstrap Plugin
 *
 * Initializes SQLite-based persistent caching for the hub.
 * Replaces the default in-memory cache with a persistent SQLite cache
 * stored at .brika/cache.db
 */

import { join } from 'node:path';
import { inject } from '@brika/di';
import { HttpClient, SqliteCache, type SqliteCacheOptions } from '@brika/http';
import { dataDir } from '@/cli/utils/runtime';
import { Logger } from '@/runtime/logs/log-router';
import type { BootstrapPlugin } from '../plugin';

let cacheInstance: SqliteCache | null = null;

/** Options accepted by the cache bootstrap plugin. */
export interface CachePluginOptions {
  /** Override the SqliteCache constructor (useful for testing). */
  CacheClass?: new (opts: SqliteCacheOptions) => SqliteCache;
}

/**
 * Creates a cache bootstrap plugin that initializes SQLite caching.
 *
 * @example
 * ```ts
 * await bootstrap()
 *   .use(cache())
 *   .use(routes(allRoutes))
 *   .start();
 * ```
 */
export function cache(options?: CachePluginOptions): BootstrapPlugin {
  const CacheImpl = options?.CacheClass ?? SqliteCache;
  const logger = inject(Logger);
  const httpClient = inject(HttpClient);

  return {
    name: 'cache',

    // biome-ignore lint/suspicious/useAwait: bootstrap expects async lifecycle methods
    async onInit() {
      const cachePath = join(dataDir, 'cache.db');

      logger.info('Initializing SQLite cache', { path: cachePath });

      try {
        cacheInstance = new CacheImpl({
          path: cachePath,
          cleanupIntervalMs: 300_000, // Clean up expired entries every 5 minutes
          walMode: true, // Better concurrent performance
        });

        // Replace the default MemoryCache with SqliteCache
        httpClient.setCache(cacheInstance);

        const stats = cacheInstance.stats();
        logger.info('SQLite cache initialized', {
          entries: stats.size,
          tags: stats.tags,
          dbSizeBytes: stats.dbSizeBytes,
        });
      } catch (error) {
        logger.error('Failed to initialize SQLite cache, falling back to memory cache', {
          error: String(error),
        });
        // Keep the default MemoryCache
      }
    },

    onStop() {
      if (cacheInstance) {
        logger.info('Closing SQLite cache');
        cacheInstance.destroy();
        cacheInstance = null;
      }
    },
  };
}

/**
 * Get the current cache instance (for debugging/testing)
 */
export function getCacheInstance(): SqliteCache | null {
  return cacheInstance;
}
