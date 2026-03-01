import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { unlinkSync } from 'node:fs';
import { SqliteCache } from '../cache/sqlite-cache';

describe('SqliteCache', () => {
  let cache: SqliteCache;
  const testDbPath = '/tmp/brika-test-cache.db';

  beforeEach(() => {
    // Clean up any existing test database
    try {
      unlinkSync(testDbPath);
      unlinkSync(`${testDbPath}-wal`);
      unlinkSync(`${testDbPath}-shm`);
    } catch {
      // Ignore if files don't exist
    }

    cache = new SqliteCache({
      path: testDbPath,
      cleanupIntervalMs: 60_000,
    });
  });

  afterEach(() => {
    cache.destroy();
    // Clean up test database
    try {
      unlinkSync(testDbPath);
      unlinkSync(`${testDbPath}-wal`);
      unlinkSync(`${testDbPath}-shm`);
    } catch {
      // Ignore if files don't exist
    }
  });

  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      cache.set(
        'key1',
        {
          data: 'test',
        },
        60_000
      );
      const result = cache.get<{
        data: string;
      }>('key1');
      expect(result).toEqual({
        data: 'test',
      });
    });

    it('should return null for non-existent keys', () => {
      const result = cache.get('non-existent');
      expect(result).toBeNull();
    });

    it('should delete values', () => {
      cache.set('key1', 'value1', 60_000);
      expect(cache.has('key1')).toBe(true);

      cache.delete('key1');
      expect(cache.has('key1')).toBe(false);
      expect(cache.get('key1')).toBeNull();
    });

    it('should check if key exists', () => {
      expect(cache.has('key1')).toBe(false);
      cache.set('key1', 'value1', 60_000);
      expect(cache.has('key1')).toBe(true);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1', 60_000);
      cache.set('key2', 'value2', 60_000);
      cache.set('key3', 'value3', 60_000);

      cache.clear();

      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key3')).toBe(false);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      cache.set('expiring', 'value', 50); // 50ms TTL

      expect(cache.get('expiring')).toBe('value');

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(cache.get('expiring')).toBeNull();
    });

    it('should not return expired entries with has()', async () => {
      cache.set('expiring', 'value', 50);

      expect(cache.has('expiring')).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(cache.has('expiring')).toBe(false);
    });

    it('should clean up expired entries', async () => {
      cache.set('keep', 'value', 60_000);
      cache.set('expire1', 'value', 10);
      cache.set('expire2', 'value', 10);

      await new Promise((resolve) => setTimeout(resolve, 50));

      cache.cleanup();

      const stats = cache.stats();
      expect(stats.size).toBe(1);
      expect(cache.has('keep')).toBe(true);
    });
  });

  describe('tag-based invalidation', () => {
    it('should store entries with tags', () => {
      cache.set('key1', 'value1', 60_000, [
        'tag-a',
        'tag-b',
      ]);
      cache.set('key2', 'value2', 60_000, [
        'tag-a',
      ]);
      cache.set('key3', 'value3', 60_000, [
        'tag-b',
      ]);

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
    });

    it('should invalidate entries by single tag', () => {
      cache.set('key1', 'value1', 60_000, [
        'tag-a',
        'tag-b',
      ]);
      cache.set('key2', 'value2', 60_000, [
        'tag-a',
      ]);
      cache.set('key3', 'value3', 60_000, [
        'tag-b',
      ]);

      cache.invalidateByTag('tag-a');

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.get('key3')).toBe('value3');
    });

    it('should invalidate entries by multiple tags', () => {
      cache.set('key1', 'value1', 60_000, [
        'tag-a',
      ]);
      cache.set('key2', 'value2', 60_000, [
        'tag-b',
      ]);
      cache.set('key3', 'value3', 60_000, [
        'tag-c',
      ]);

      cache.invalidateByTags([
        'tag-a',
        'tag-b',
      ]);

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.get('key3')).toBe('value3');
    });

    it('should get entries by tag', () => {
      cache.set('key1', 'value1', 60_000, [
        'npm-search',
      ]);
      cache.set('key2', 'value2', 60_000, [
        'npm-search',
      ]);
      cache.set('key3', 'value3', 60_000, [
        'other',
      ]);

      const results = cache.getByTag<string>('npm-search');
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.key).sort()).toEqual([
        'key1',
        'key2',
      ]);
    });
  });

  describe('statistics', () => {
    it('should report cache stats', () => {
      cache.set('key1', 'value1', 60_000, [
        'tag-a',
      ]);
      cache.set('key2', 'value2', 60_000, [
        'tag-a',
        'tag-b',
      ]);
      cache.set('key3', 'value3', 60_000);

      const stats = cache.stats();
      expect(stats.size).toBe(3);
      expect(stats.tags).toBe(2); // tag-a and tag-b
      expect(stats.expired).toBe(0);
    });

    it('should count expired entries', async () => {
      cache.set('keep', 'value', 60_000);
      cache.set('expire', 'value', 10);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const stats = cache.stats();
      expect(stats.expired).toBe(1);
    });
  });

  describe('entry metadata', () => {
    it('should get entry with metadata', () => {
      cache.set(
        'key1',
        {
          data: 'test',
        },
        60_000,
        [
          'tag-a',
        ]
      );

      const entry = cache.getEntry('key1');
      expect(entry).not.toBeNull();
      expect(entry?.value).toEqual({
        data: 'test',
      });
      expect(entry?.ttl).toBe(60_000);
      expect(entry?.tags).toEqual([
        'tag-a',
      ]);
      expect(entry?.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should return null for expired entries', async () => {
      cache.set('key1', 'value', 10);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const entry = cache.getEntry('key1');
      expect(entry).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty tags array', () => {
      cache.set('key1', 'value1', 60_000, []);
      expect(cache.get('key1')).toBe('value1');

      cache.invalidateByTags([]);
      expect(cache.get('key1')).toBe('value1');
    });

    it('should handle overwriting existing keys', () => {
      cache.set('key1', 'value1', 60_000, [
        'tag-old',
      ]);
      cache.set('key1', 'value2', 60_000, [
        'tag-new',
      ]);

      expect(cache.get('key1')).toBe('value2');

      // Old tag should no longer invalidate
      cache.invalidateByTag('tag-old');
      expect(cache.get('key1')).toBe('value2');

      // New tag should invalidate
      cache.invalidateByTag('tag-new');
      expect(cache.get('key1')).toBeNull();
    });

    it('should handle complex JSON values', () => {
      const complexValue = {
        array: [
          1,
          2,
          {
            nested: 'value',
          },
        ],
        date: '2024-01-01T00:00:00Z',
        number: 42.5,
        boolean: true,
        null: null,
      };

      cache.set('complex', complexValue, 60_000);
      expect(cache.get('complex')).toEqual(complexValue);
    });

    it('should handle special characters in keys', () => {
      const specialKey = 'https://example.com/api?foo=bar&baz=qux';
      cache.set(specialKey, 'value', 60_000);
      expect(cache.get(specialKey)).toBe('value');
    });
  });

  describe('in-memory mode', () => {
    it('should work with :memory: path', () => {
      const memoryCache = new SqliteCache({
        path: ':memory:',
        cleanupIntervalMs: 60_000,
      });

      memoryCache.set('key1', 'value1', 60_000);
      expect(memoryCache.get('key1')).toBe('value1');

      memoryCache.destroy();
    });
  });
});
