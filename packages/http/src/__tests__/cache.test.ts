/**
 * Tests for cache system
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { generateCacheKey, MemoryCache } from '../cache';
import type { RequestConfig } from '../types';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache();
  });

  afterEach(() => {
    cache.destroy();
  });

  test('should store and retrieve values', () => {
    cache.set('key1', 'value1', 60_000);

    expect(cache.get('key1')).toBe('value1');
    expect(cache.has('key1')).toBe(true);
  });

  test('should return null for missing keys', () => {
    expect(cache.get('missing')).toBe(null);
    expect(cache.has('missing')).toBe(false);
  });

  test('should expire entries after TTL', async () => {
    cache.set('key1', 'value1', 100);

    expect(cache.get('key1')).toBe('value1');

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(cache.get('key1')).toBe(null);
    expect(cache.has('key1')).toBe(false);
  });

  test('should delete entries', () => {
    cache.set('key1', 'value1', 60_000);

    expect(cache.has('key1')).toBe(true);

    cache.delete('key1');

    expect(cache.has('key1')).toBe(false);
  });

  test('should clear all entries', () => {
    cache.set('key1', 'value1', 60_000);
    cache.set('key2', 'value2', 60_000);

    expect(cache.has('key1')).toBe(true);
    expect(cache.has('key2')).toBe(true);

    cache.clear();

    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(false);
  });

  test('should support tag-based invalidation', () => {
    cache.set('key1', 'value1', 60_000, ['tag1']);
    cache.set('key2', 'value2', 60_000, ['tag1', 'tag2']);
    cache.set('key3', 'value3', 60_000, ['tag2']);

    cache.invalidateByTag('tag1');

    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(false);
    expect(cache.has('key3')).toBe(true);
  });

  test('should support multiple tag invalidation', () => {
    cache.set('key1', 'value1', 60_000, ['tag1']);
    cache.set('key2', 'value2', 60_000, ['tag2']);
    cache.set('key3', 'value3', 60_000, ['tag3']);

    cache.invalidateByTags(['tag1', 'tag2']);

    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(false);
    expect(cache.has('key3')).toBe(true);
  });

  test('should provide cache statistics', () => {
    cache.set('key1', 'value1', 60_000);
    cache.set('key2', 'value2', 60_000, ['tag1']);

    const stats = cache.stats();

    expect(stats.size).toBe(2);
    expect(stats.tags).toBe(1);
    expect(stats.expired).toBe(0);
  });

  test('should cleanup expired entries', async () => {
    cache.set('key1', 'value1', 100);
    cache.set('key2', 'value2', 60_000);

    // Wait for first entry to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    cache.cleanup();

    expect(cache.has('key1')).toBe(false);
    expect(cache.has('key2')).toBe(true);
  });
});

describe('generateCacheKey', () => {
  test('should generate key from method and URL', () => {
    const config: RequestConfig = {
      method: 'GET',
      url: 'https://api.example.com/users',
    };

    const key = generateCacheKey(config);

    expect(key).toBe('GET|https://api.example.com/users');
  });

  test('should include query parameters', () => {
    const config: RequestConfig = {
      method: 'GET',
      url: 'https://api.example.com/users',
      params: {
        id: '123',
        sort: 'name',
      },
    };

    const key = generateCacheKey(config);

    expect(key).toContain('id=123');
    expect(key).toContain('sort=name');
  });

  test('should sort query parameters', () => {
    const config1: RequestConfig = {
      method: 'GET',
      url: 'https://api.example.com/users',
      params: {
        a: '1',
        b: '2',
      },
    };

    const config2: RequestConfig = {
      method: 'GET',
      url: 'https://api.example.com/users',
      params: {
        b: '2',
        a: '1',
      },
    };

    expect(generateCacheKey(config1)).toBe(generateCacheKey(config2));
  });

  test('should include body hash for POST requests', () => {
    const config: RequestConfig = {
      method: 'POST',
      url: 'https://api.example.com/users',
      body: {
        name: 'John',
      },
    };

    const key = generateCacheKey(config);

    expect(key).toContain('POST');
    expect(key.split('|').length).toBeGreaterThan(2);
  });

  test('should ignore undefined/null params', () => {
    const config: RequestConfig = {
      method: 'GET',
      url: 'https://api.example.com/users',
      params: {
        a: '1',
        b: undefined,
        c: null,
      },
    };

    const key = generateCacheKey(config);

    expect(key).toContain('a=1');
    expect(key).not.toContain('b=');
    expect(key).not.toContain('c=');
  });

  test('should hash string body for POST requests', () => {
    const config: RequestConfig = {
      method: 'POST',
      url: 'https://api.example.com/data',
      body: 'raw string body',
    };

    const key = generateCacheKey(config);

    expect(key.split('|').length).toBe(3);
  });

  test('should handle FormData body', () => {
    const formData = new FormData();
    formData.append('field', 'value');

    const config: RequestConfig = {
      method: 'POST',
      url: 'https://api.example.com/upload',
      body: formData,
    };

    const key = generateCacheKey(config);

    expect(key).toContain('formdata');
  });

  test('should handle Blob body', () => {
    const blob = new Blob(['test content'], {
      type: 'text/plain',
    });

    const config: RequestConfig = {
      method: 'PUT',
      url: 'https://api.example.com/upload',
      body: blob,
    };

    const key = generateCacheKey(config);

    expect(key).toContain('blob:');
    expect(key).toContain('text/plain');
  });

  test('should handle ArrayBuffer body', () => {
    const buffer = new ArrayBuffer(16);

    const config: RequestConfig = {
      method: 'PATCH',
      url: 'https://api.example.com/binary',
      body: buffer as unknown as RequestConfig['body'],
    };

    const key = generateCacheKey(config);

    expect(key).toContain('arraybuffer:16');
  });

  test('should handle URLSearchParams body', () => {
    const params = new URLSearchParams();
    params.set('key', 'value');

    const config: RequestConfig = {
      method: 'POST',
      url: 'https://api.example.com/form',
      body: params,
    };

    const key = generateCacheKey(config);

    // URLSearchParams body should produce a hash
    expect(key.split('|').length).toBe(3);
  });

  test('should handle non-serializable object body gracefully', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const config: RequestConfig = {
      method: 'POST',
      url: 'https://api.example.com/data',
      body: circular,
    };

    const key = generateCacheKey(config);

    // Falls back to 'object' when JSON.stringify throws
    expect(key).toContain('object');
  });

  test('should not include body hash for GET requests', () => {
    const config: RequestConfig = {
      method: 'GET',
      url: 'https://api.example.com/data',
      body: {
        data: 'test',
      },
    };

    const key = generateCacheKey(config);

    // GET requests should only have method|url
    expect(key).toBe('GET|https://api.example.com/data');
  });

  test('should skip empty params object', () => {
    const config: RequestConfig = {
      method: 'GET',
      url: 'https://api.example.com/data',
      params: {},
    };

    const key = generateCacheKey(config);

    expect(key).toBe('GET|https://api.example.com/data');
  });
});
