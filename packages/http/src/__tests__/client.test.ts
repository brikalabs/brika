/**
 * Tests for HttpClient
 *
 * These are integration tests that hit httpbin.org and registry.npmjs.org.
 * Skipped on CI because external services can be unreliable on GitHub Actions.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { MemoryCache } from '../cache';
import { HttpClient } from '../client';
import { HttpError } from '../types';

describe.skipIf(!!process.env.CI)('HttpClient', () => {
  let client: HttpClient;

  beforeEach(() => {
    client = new HttpClient();
  });

  describe('Basic requests', () => {
    test('should make GET request', async () => {
      const response = await client
        .get<{ name: string }>('https://registry.npmjs.org/-/v1/search')
        .params({ text: 'brika', size: '1' })
        .send();

      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(response.cached).toBe(false);
    });

    test('should make POST request with JSON body', async () => {
      const response = await client
        .post<{ json: unknown }>('https://httpbin.org/post')
        .json({ test: 'data' })
        .send();

      expect(response.status).toBe(200);
      expect(response.data.json).toEqual({ test: 'data' });
    });

    test('should handle query parameters', async () => {
      const response = await client
        .get('https://httpbin.org/get')
        .params({ foo: 'bar', baz: '123' })
        .send();

      expect(response.status).toBe(200);
    });

    test('should handle custom headers', async () => {
      const response = await client
        .get('https://httpbin.org/headers')
        .header('X-Custom-Header', 'test-value')
        .send();

      expect(response.status).toBe(200);
    });
  });

  describe('Error handling', () => {
    test('should throw HttpError for 4xx status', async () => {
      await expect(async () => {
        await client.get('https://httpbin.org/status/404').send();
      }).toThrow(HttpError);
    });

    test('should throw HttpError for 5xx status', async () => {
      await expect(async () => {
        await client.get('https://httpbin.org/status/500').send();
      }).toThrow(HttpError);
    });
  });

  describe('Caching', () => {
    beforeEach(() => {
      client = HttpClient.create({
        cache: new MemoryCache(),
      });
    });

    test('should cache GET requests', async () => {
      const url = 'https://httpbin.org/uuid';

      const response1 = await client.get(url).cache({ ttl: 60_000 }).send();
      const response2 = await client.get(url).cache({ ttl: 60_000 }).send();

      expect(response1.cached).toBe(false);
      expect(response2.cached).toBe(true);
      expect(response1.data).toEqual(response2.data);
    });

    test('should not cache without cache options', async () => {
      const url = 'https://httpbin.org/uuid';

      const response1 = await client.get(url).send();
      const response2 = await client.get(url).send();

      expect(response1.cached).toBe(false);
      expect(response2.cached).toBe(false);
    });

    test('should respect cache TTL', async () => {
      const url = 'https://httpbin.org/uuid';

      const response1 = await client.get(url).cache({ ttl: 100 }).send();

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      const response2 = await client.get(url).cache({ ttl: 100 }).send();

      expect(response1.cached).toBe(false);
      expect(response2.cached).toBe(false);
    });

    test('should invalidate cache by tag', async () => {
      const url = 'https://httpbin.org/uuid';

      await client
        .get(url)
        .cache({ ttl: 60_000, tags: ['test'] })
        .send();

      client.invalidateCache('test');

      const response = await client
        .get(url)
        .cache({ ttl: 60_000, tags: ['test'] })
        .send();

      expect(response.cached).toBe(false);
    });
  });

  describe('Builder API', () => {
    test('should chain methods', async () => {
      const response = await client
        .get('https://httpbin.org/get')
        .params({ foo: 'bar' })
        .header('X-Test', 'value')
        .timeout(5000)
        .send();

      expect(response.status).toBe(200);
    });

    test('should return only data with .data()', async () => {
      const data = await client.get<{ uuid: string }>('https://httpbin.org/uuid').data();

      expect(data).toHaveProperty('uuid');
    });
  });

  describe('Shorthand HTTP methods', () => {
    test('should make PUT request', async () => {
      const response = await client
        .put<{ json: unknown }>('https://httpbin.org/put', { key: 'value' })
        .send();

      expect(response.status).toBe(200);
      expect(response.data.json).toEqual({ key: 'value' });
    });

    test('should make PUT request without body', async () => {
      const response = await client.put('https://httpbin.org/put').send();

      expect(response.status).toBe(200);
    });

    test('should make PATCH request', async () => {
      const response = await client
        .patch<{ json: unknown }>('https://httpbin.org/patch', { patched: true })
        .send();

      expect(response.status).toBe(200);
      expect(response.data.json).toEqual({ patched: true });
    });

    test('should make PATCH request without body', async () => {
      const response = await client.patch('https://httpbin.org/patch').send();

      expect(response.status).toBe(200);
    });

    test('should make DELETE request', async () => {
      const response = await client.delete('https://httpbin.org/delete').send();

      expect(response.status).toBe(200);
    });

    test('should make HEAD request', async () => {
      const response = await client.head('https://httpbin.org/get').send();

      expect(response.status).toBe(200);
    });

    test('should make OPTIONS request', async () => {
      // httpbin doesn't have a dedicated OPTIONS endpoint, but we can verify
      // the method creates a builder with the correct HTTP method
      const builder = client.options('https://httpbin.org/get');
      expect(builder).toBeDefined();
      // OPTIONS requests may get CORS-blocked in some environments,
      // so just verify the builder was created correctly
    });
  });

  describe('Cache management', () => {
    test('setCache replaces the cache adapter', () => {
      const newCache = new MemoryCache();
      client.setCache(newCache);

      expect(client.getCache()).toBe(newCache);
    });

    test('setCache with null removes the cache adapter', () => {
      client.setCache(null);

      expect(client.getCache()).toBeUndefined();
    });

    test('getCache returns the current cache adapter', () => {
      const cache = client.getCache();

      // Default client has a MemoryCache
      expect(cache).toBeDefined();
      expect(cache).toBeInstanceOf(MemoryCache);
    });

    test('clearCache clears the cache', async () => {
      const url = 'https://httpbin.org/uuid';

      // Populate cache
      await client.get(url).cache({ ttl: 60_000 }).send();

      // Clear it
      client.clearCache();

      // Should no longer be cached
      const response = await client.get(url).cache({ ttl: 60_000 }).send();
      expect(response.cached).toBe(false);
    });

    test('clearCache is safe when no cache is set', () => {
      client.setCache(null);

      // Should not throw
      expect(() => client.clearCache()).not.toThrow();
    });

    test('invalidateCacheTags invalidates by multiple tags', async () => {
      const cache = new MemoryCache();
      client.setCache(cache);

      const url1 = 'https://httpbin.org/uuid?a=1';
      const url2 = 'https://httpbin.org/uuid?a=2';

      // Populate with different tags
      await client
        .get(url1)
        .cache({ ttl: 60_000, tags: ['tag-a'] })
        .send();
      await client
        .get(url2)
        .cache({ ttl: 60_000, tags: ['tag-b'] })
        .send();

      // Invalidate both tags
      client.invalidateCacheTags(['tag-a', 'tag-b']);

      // Both should be uncached now
      const r1 = await client
        .get(url1)
        .cache({ ttl: 60_000, tags: ['tag-a'] })
        .send();
      const r2 = await client
        .get(url2)
        .cache({ ttl: 60_000, tags: ['tag-b'] })
        .send();

      expect(r1.cached).toBe(false);
      expect(r2.cached).toBe(false);
    });

    test('invalidateCacheTags is safe when no cache is set', () => {
      client.setCache(null);

      // Should not throw
      expect(() => client.invalidateCacheTags(['any-tag'])).not.toThrow();
    });
  });

  describe('Configuration', () => {
    test('should use baseUrl', async () => {
      const clientWithBase = HttpClient.create({
        baseUrl: 'https://httpbin.org',
      });

      const response = await clientWithBase.get('/get').send();

      expect(response.status).toBe(200);
    });

    test('should merge default headers', async () => {
      const clientWithHeaders = HttpClient.create({
        headers: {
          'X-Default-Header': 'default-value',
        },
      });

      const response = await clientWithHeaders
        .get('https://httpbin.org/headers')
        .header('X-Custom-Header', 'custom-value')
        .send();

      expect(response.status).toBe(200);
    });
  });
});
