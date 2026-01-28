/**
 * Cache adapter interface for pluggable caching
 */

/**
 * Cache entry metadata
 */
export interface CacheEntry<T = unknown> {
  /** Cached value */
  value: T;
  /** Timestamp when entry was created */
  timestamp: number;
  /** Time-to-live in milliseconds */
  ttl: number;
  /** Cache tags for group invalidation */
  tags?: string[];
}

/**
 * Cache adapter interface
 */
export interface CacheAdapter {
  /**
   * Get a value from cache
   */
  get<T = unknown>(key: string): Promise<T | null> | T | null;

  /**
   * Set a value in cache
   */
  set<T = unknown>(key: string, value: T, ttl: number, tags?: string[]): Promise<void> | void;

  /**
   * Delete a value from cache
   */
  delete(key: string): Promise<void> | void;

  /**
   * Check if a key exists in cache
   */
  has(key: string): Promise<boolean> | boolean;

  /**
   * Clear all cache entries
   */
  clear(): Promise<void> | void;

  /**
   * Invalidate cache entries by tag
   */
  invalidateByTag(tag: string): Promise<void> | void;

  /**
   * Invalidate cache entries by tags
   */
  invalidateByTags(tags: string[]): Promise<void> | void;
}
