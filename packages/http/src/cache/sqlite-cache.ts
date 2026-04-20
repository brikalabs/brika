import { and, type BrikaDatabase, eq, gt, inArray, lt, sql } from '@brika/db';
import type { CacheAdapter, CacheEntry } from './cache-adapter';
import { cacheDb } from './database';
import { cacheEntries, cacheTags } from './schema';

export interface SqliteCacheOptions {
  path: string;
  cleanupIntervalMs?: number;
}

type CacheSchema = { cacheEntries: typeof cacheEntries; cacheTags: typeof cacheTags };

export class SqliteCache implements CacheAdapter {
  readonly #database: BrikaDatabase<CacheSchema>;
  #cleanupInterval?: Timer;

  constructor(private readonly options: SqliteCacheOptions) {
    this.#database = cacheDb.open(options.path);
    this.#startCleanup(options.cleanupIntervalMs ?? 300_000);
  }

  private get db() {
    return this.#database.db;
  }

  get<T = unknown>(key: string): T | null {
    const row = this.db
      .select({ value: cacheEntries.value, expiresAt: cacheEntries.expiresAt })
      .from(cacheEntries)
      .where(eq(cacheEntries.key, key))
      .get();

    if (!row) {
      return null;
    }

    if (Date.now() > row.expiresAt) {
      this.delete(key);
      return null;
    }

    try {
      return JSON.parse(row.value) as T;
    } catch {
      this.delete(key);
      return null;
    }
  }

  set<T = unknown>(key: string, value: T, ttl: number, tags?: string[]): void {
    const timestamp = Date.now();
    const expiresAt = timestamp + ttl;
    const serialized = JSON.stringify(value);

    this.db.transaction((tx) => {
      tx.delete(cacheEntries).where(eq(cacheEntries.key, key)).run();
      tx.insert(cacheEntries).values({ key, value: serialized, timestamp, ttl, expiresAt }).run();

      if (tags && tags.length > 0) {
        tx.insert(cacheTags)
          .values(tags.map((tag) => ({ key, tag })))
          .run();
      }
    });
  }

  delete(key: string): void {
    this.db.delete(cacheEntries).where(eq(cacheEntries.key, key)).run();
  }

  has(key: string): boolean {
    const row = this.db
      .select({ expiresAt: cacheEntries.expiresAt })
      .from(cacheEntries)
      .where(eq(cacheEntries.key, key))
      .get();

    if (!row) {
      return false;
    }

    if (Date.now() > row.expiresAt) {
      this.delete(key);
      return false;
    }

    return true;
  }

  clear(): void {
    this.db.delete(cacheEntries).run();
  }

  invalidateByTag(tag: string): void {
    this.invalidateByTags([tag]);
  }

  invalidateByTags(tags: string[]): void {
    if (tags.length === 0) {
      return;
    }

    const keys = this.db
      .selectDistinct({ key: cacheTags.key })
      .from(cacheTags)
      .where(inArray(cacheTags.tag, tags))
      .all()
      .map((r) => r.key);

    if (keys.length > 0) {
      this.db.delete(cacheEntries).where(inArray(cacheEntries.key, keys)).run();
    }
  }

  stats(): { size: number; tags: number; expired: number; dbSizeBytes: number } {
    const now = Date.now();

    const size =
      this.db.select({ count: sql<number>`count(*)` }).from(cacheEntries).get()?.count ?? 0;

    const tags =
      this.db
        .select({ count: sql<number>`count(distinct ${cacheTags.tag})` })
        .from(cacheTags)
        .get()?.count ?? 0;

    const expired =
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(cacheEntries)
        .where(lt(cacheEntries.expiresAt, now))
        .get()?.count ?? 0;

    let dbSizeBytes = 0;
    try {
      dbSizeBytes = Bun.file(this.options.path).size;
    } catch {
      /* in-memory */
    }

    return { size, tags, expired, dbSizeBytes };
  }

  cleanup(): void {
    this.db.delete(cacheEntries).where(lt(cacheEntries.expiresAt, Date.now())).run();
  }

  getByTag<T = unknown>(tag: string): Array<{ key: string; value: T }> {
    const now = Date.now();

    return this.db
      .select({ key: cacheEntries.key, value: cacheEntries.value })
      .from(cacheEntries)
      .innerJoin(cacheTags, eq(cacheEntries.key, cacheTags.key))
      .where(and(eq(cacheTags.tag, tag), gt(cacheEntries.expiresAt, now)))
      .all()
      .map((row) => ({ key: row.key, value: JSON.parse(row.value) as T }));
  }

  getEntry(key: string): CacheEntry | null {
    const row = this.db.select().from(cacheEntries).where(eq(cacheEntries.key, key)).get();

    if (!row || Date.now() > row.expiresAt) {
      return null;
    }

    const tags = this.db
      .select({ tag: cacheTags.tag })
      .from(cacheTags)
      .where(eq(cacheTags.key, key))
      .all()
      .map((r) => r.tag);

    return {
      value: JSON.parse(row.value),
      timestamp: row.timestamp,
      ttl: row.ttl,
      tags: tags.length > 0 ? tags : undefined,
    };
  }

  destroy(): void {
    if (this.#cleanupInterval) {
      clearInterval(this.#cleanupInterval);
      this.#cleanupInterval = undefined;
    }
    this.#database.sqlite.close();
  }

  #startCleanup(intervalMs: number): void {
    this.#cleanupInterval = setInterval(() => {
      this.cleanup();
    }, intervalMs);
    this.#cleanupInterval.unref();
  }
}
