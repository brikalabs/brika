/**
 * SQLite-based cache adapter implementation using Bun's native sqlite
 * Provides persistent caching with TTL and tag-based invalidation
 */

import { Database } from 'bun:sqlite';
import type { CacheAdapter, CacheEntry } from './cache-adapter';

export interface SqliteCacheOptions {
  /** Path to the SQLite database file. Use ':memory:' for in-memory database */
  path: string;
  /** Cleanup interval in milliseconds (default: 5 minutes) */
  cleanupIntervalMs?: number;
  /** Enable WAL mode for better concurrent performance (default: true) */
  walMode?: boolean;
}

/**
 * SQLite cache adapter with TTL support and tag-based invalidation
 * Uses Bun's native bun:sqlite for zero-dependency persistent caching
 */
export class SqliteCache implements CacheAdapter {
  readonly #db: Database;
  #cleanupInterval?: Timer;

  constructor(private readonly options: SqliteCacheOptions) {
    this.#db = new Database(options.path);

    // Enable foreign key constraints (required for CASCADE to work)
    this.#db.run('PRAGMA foreign_keys = ON');

    // Enable WAL mode for better performance (unless explicitly disabled)
    if (options.walMode !== false) {
      this.#db.run('PRAGMA journal_mode = WAL');
    }

    // Optimize for performance
    this.#db.run('PRAGMA synchronous = NORMAL');
    this.#db.run('PRAGMA cache_size = 10000');
    this.#db.run('PRAGMA temp_store = MEMORY');

    this.#initSchema();
    this.#startCleanup(options.cleanupIntervalMs ?? 300_000);
  }

  /**
   * Initialize database schema
   */
  #initSchema(): void {
    this.#db.run(`
      CREATE TABLE IF NOT EXISTS cache_entries (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        ttl INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cache_tags (
        key TEXT NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (key, tag),
        FOREIGN KEY (key) REFERENCES cache_entries(key) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache_entries(expires_at);
      CREATE INDEX IF NOT EXISTS idx_cache_tags_tag ON cache_tags(tag);
    `);
  }

  /**
   * Get a value from cache
   */
  get<T = unknown>(key: string): T | null {
    const stmt = this.#db.prepare<{ value: string; expires_at: number }, [string]>(
      'SELECT value, expires_at FROM cache_entries WHERE key = ?'
    );

    const row = stmt.get(key);

    if (!row) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() > row.expires_at) {
      this.delete(key);
      return null;
    }

    try {
      return JSON.parse(row.value) as T;
    } catch {
      // Corrupted entry, delete it
      this.delete(key);
      return null;
    }
  }

  /**
   * Set a value in cache
   */
  set<T = unknown>(key: string, value: T, ttl: number, tags?: string[]): void {
    const timestamp = Date.now();
    const expiresAt = timestamp + ttl;
    const serialized = JSON.stringify(value);

    // Use a transaction for atomicity
    this.#db.transaction(() => {
      // Delete existing entry and its tags
      this.#db.prepare('DELETE FROM cache_entries WHERE key = ?').run(key);

      // Insert new entry
      this.#db
        .prepare(
          'INSERT INTO cache_entries (key, value, timestamp, ttl, expires_at) VALUES (?, ?, ?, ?, ?)'
        )
        .run(key, serialized, timestamp, ttl, expiresAt);

      // Insert tags
      if (tags && tags.length > 0) {
        const tagStmt = this.#db.prepare('INSERT INTO cache_tags (key, tag) VALUES (?, ?)');
        for (const tag of tags) {
          tagStmt.run(key, tag);
        }
      }
    })();
  }

  /**
   * Delete a value from cache
   */
  delete(key: string): void {
    // Tags are automatically deleted due to CASCADE
    this.#db.prepare('DELETE FROM cache_entries WHERE key = ?').run(key);
  }

  /**
   * Check if a key exists in cache (and is not expired)
   */
  has(key: string): boolean {
    const stmt = this.#db.prepare<{ expires_at: number }, [string]>(
      'SELECT expires_at FROM cache_entries WHERE key = ?'
    );

    const row = stmt.get(key);

    if (!row) {
      return false;
    }

    if (Date.now() > row.expires_at) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.#db.run('DELETE FROM cache_entries');
  }

  /**
   * Invalidate cache entries by tag
   */
  invalidateByTag(tag: string): void {
    this.#db
      .prepare(
        `DELETE FROM cache_entries WHERE key IN (
        SELECT key FROM cache_tags WHERE tag = ?
      )`
      )
      .run(tag);
  }

  /**
   * Invalidate cache entries by multiple tags
   */
  invalidateByTags(tags: string[]): void {
    if (tags.length === 0) return;

    const placeholders = tags.map(() => '?').join(', ');
    this.#db
      .prepare(
        `DELETE FROM cache_entries WHERE key IN (
        SELECT key FROM cache_tags WHERE tag IN (${placeholders})
      )`
      )
      .run(...tags);
  }

  /**
   * Get cache statistics
   */
  stats(): {
    size: number;
    tags: number;
    expired: number;
    dbSizeBytes: number;
  } {
    const now = Date.now();

    const sizeRow = this.#db.prepare<{ count: number }, []>('SELECT COUNT(*) as count FROM cache_entries').get();

    const tagsRow = this.#db
      .prepare<{ count: number }, []>('SELECT COUNT(DISTINCT tag) as count FROM cache_tags')
      .get();

    const expiredRow = this.#db
      .prepare<{ count: number }, [number]>('SELECT COUNT(*) as count FROM cache_entries WHERE expires_at < ?')
      .get(now);

    // Get database file size
    let dbSizeBytes = 0;
    try {
      const file = Bun.file(this.options.path);
      dbSizeBytes = file.size;
    } catch {
      // In-memory database or file doesn't exist yet
    }

    return {
      size: sizeRow?.count ?? 0,
      tags: tagsRow?.count ?? 0,
      expired: expiredRow?.count ?? 0,
      dbSizeBytes,
    };
  }

  /**
   * Manually trigger cleanup of expired entries
   */
  cleanup(): void {
    this.#db.prepare('DELETE FROM cache_entries WHERE expires_at < ?').run(Date.now());
  }

  /**
   * Start automatic cleanup of expired entries
   */
  #startCleanup(intervalMs: number): void {
    this.#cleanupInterval = setInterval(() => {
      this.cleanup();
    }, intervalMs);

    // Don't keep the process alive
    if (typeof this.#cleanupInterval === 'object' && 'unref' in this.#cleanupInterval) {
      this.#cleanupInterval.unref();
    }
  }

  /**
   * Close the database connection and stop cleanup
   */
  destroy(): void {
    if (this.#cleanupInterval) {
      clearInterval(this.#cleanupInterval);
      this.#cleanupInterval = undefined;
    }
    this.#db.close();
  }

  /**
   * Get all entries for a specific tag (useful for debugging)
   */
  getByTag<T = unknown>(tag: string): Array<{ key: string; value: T }> {
    const now = Date.now();
    const rows = this.#db
      .prepare<{ key: string; value: string }, [string, number]>(
        `SELECT e.key, e.value FROM cache_entries e
         INNER JOIN cache_tags t ON e.key = t.key
         WHERE t.tag = ? AND e.expires_at > ?`
      )
      .all(tag, now);

    return rows.map((row) => ({
      key: row.key,
      value: JSON.parse(row.value) as T,
    }));
  }

  /**
   * Get metadata for a cache entry
   */
  getEntry(key: string): CacheEntry | null {
    const row = this.#db
      .prepare<{ value: string; timestamp: number; ttl: number; expires_at: number }, [string]>(
        'SELECT value, timestamp, ttl, expires_at FROM cache_entries WHERE key = ?'
      )
      .get(key);

    if (!row || Date.now() > row.expires_at) {
      return null;
    }

    const tags = this.#db
      .prepare<{ tag: string }, [string]>('SELECT tag FROM cache_tags WHERE key = ?')
      .all(key)
      .map((r) => r.tag);

    return {
      value: JSON.parse(row.value),
      timestamp: row.timestamp,
      ttl: row.ttl,
      tags: tags.length > 0 ? tags : undefined,
    };
  }
}
