/**
 * Tests for HttpClient
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { MemoryCache } from '../cache';
import { HttpClient } from '../client';
import { HttpError } from '../types';

describe('HttpClient', () => {
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
