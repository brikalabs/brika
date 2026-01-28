/**
 * In-memory cache adapter implementation
 */

import type { CacheAdapter, CacheEntry } from './cache-adapter';

/**
 * In-memory cache adapter with TTL support
 */
export class MemoryCache implements CacheAdapter {
  readonly #cache = new Map<string, CacheEntry>();
  readonly #tagIndex = new Map<string, Set<string>>();
  #cleanupInterval?: Timer;

  constructor(
    private readonly cleanupIntervalMs = 60_000 // Clean up expired entries every minute
  ) {
    this.#startCleanup();
  }

  /**
   * Get a value from cache
   */
  get<T = unknown>(key: string): T | null {
    const entry = this.#cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (this.#isExpired(entry)) {
      this.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Set a value in cache
   */
  set<T = unknown>(key: string, value: T, ttl: number, tags?: string[]): void {
    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      ttl,
      tags,
    };

    this.#cache.set(key, entry);

    // Update tag index
    if (tags && tags.length > 0) {
      for (const tag of tags) {
        if (!this.#tagIndex.has(tag)) {
          this.#tagIndex.set(tag, new Set());
        }
        this.#tagIndex.get(tag)!.add(key);
      }
    }
  }

  /**
   * Delete a value from cache
   */
  delete(key: string): void {
    const entry = this.#cache.get(key);

    if (entry?.tags) {
      // Remove from tag index
      for (const tag of entry.tags) {
        this.#tagIndex.get(tag)?.delete(key);

        // Clean up empty tag sets
        if (this.#tagIndex.get(tag)?.size === 0) {
          this.#tagIndex.delete(tag);
        }
      }
    }

    this.#cache.delete(key);
  }

  /**
   * Check if a key exists in cache
   */
  has(key: string): boolean {
    const entry = this.#cache.get(key);

    if (!entry) {
      return false;
    }

    if (this.#isExpired(entry)) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.#cache.clear();
    this.#tagIndex.clear();
  }

  /**
   * Invalidate cache entries by tag
   */
  invalidateByTag(tag: string): void {
    const keys = this.#tagIndex.get(tag);

    if (!keys) {
      return;
    }

    for (const key of keys) {
      this.delete(key);
    }

    this.#tagIndex.delete(tag);
  }

  /**
   * Invalidate cache entries by tags
   */
  invalidateByTags(tags: string[]): void {
    for (const tag of tags) {
      this.invalidateByTag(tag);
    }
  }

  /**
   * Get cache statistics
   */
  stats(): {
    size: number;
    tags: number;
    expired: number;
  } {
    let expired = 0;

    for (const entry of this.#cache.values()) {
      if (this.#isExpired(entry)) {
        expired++;
      }
    }

    return {
      size: this.#cache.size,
      tags: this.#tagIndex.size,
      expired,
    };
  }

  /**
   * Manually trigger cleanup of expired entries
   */
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.#cache.entries()) {
      if (this.#isExpired(entry, now)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.delete(key);
    }
  }

  /**
   * Stop the cleanup interval
   */
  destroy(): void {
    if (this.#cleanupInterval) {
      clearInterval(this.#cleanupInterval);
      this.#cleanupInterval = undefined;
    }
    this.clear();
  }

  /**
   * Check if a cache entry has expired
   */
  #isExpired(entry: CacheEntry, now = Date.now()): boolean {
    return now - entry.timestamp > entry.ttl;
  }

  /**
   * Start automatic cleanup of expired entries
   */
  #startCleanup(): void {
    this.#cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.cleanupIntervalMs);

    // Don't keep the process alive
    if (typeof this.#cleanupInterval === 'object' && 'unref' in this.#cleanupInterval) {
      this.#cleanupInterval.unref();
    }
  }
}
