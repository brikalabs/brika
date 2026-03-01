/**
 * Tests for RequestBuilder
 */

import { describe, expect, mock, test } from 'bun:test';
import { RequestBuilder } from '../builder';
import type { HttpResponse, RequestConfig } from '../types';

describe('RequestBuilder', () => {
  const createMockExecutor = () => {
    return mock().mockImplementation(
      async (config: RequestConfig): Promise<HttpResponse> => ({
        data: {
          success: true,
        },
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        config,
        cached: false,
      })
    );
  };

  describe('constructor', () => {
    test('creates builder with method and url', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', 'https://example.com/api', executor);

      const config = builder.getConfig();

      expect(config.method).toBe('GET');
      expect(config.url).toBe('https://example.com/api');
    });

    test('accepts base config', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('POST', '/api/users', executor, {
        headers: {
          Authorization: 'Bearer token',
        },
        timeout: 5000,
      });

      const config = builder.getConfig();

      expect(config.headers).toEqual({
        Authorization: 'Bearer token',
      });
      expect(config.timeout).toBe(5000);
    });
  });

  describe('params', () => {
    test('sets query parameters', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor);

      builder.params({
        page: 1,
        limit: 10,
      });

      const config = builder.getConfig();
      expect(config.params).toEqual({
        page: 1,
        limit: 10,
      });
    });

    test('merges with existing params', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor, {
        params: {
          status: 'active',
        },
      });

      builder.params({
        page: 1,
      });

      const config = builder.getConfig();
      expect(config.params).toEqual({
        status: 'active',
        page: 1,
      });
    });

    test('is chainable', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor);

      const result = builder.params({
        page: 1,
      });

      expect(result).toBe(builder);
    });
  });

  describe('headers', () => {
    test('sets headers', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor);

      builder.headers({
        'X-Custom': 'value',
      });

      const config = builder.getConfig();
      expect(config.headers).toEqual({
        'X-Custom': 'value',
      });
    });

    test('merges with existing headers', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor, {
        headers: {
          Authorization: 'Bearer token',
        },
      });

      builder.headers({
        'X-Custom': 'value',
      });

      const config = builder.getConfig();
      expect(config.headers).toEqual({
        Authorization: 'Bearer token',
        'X-Custom': 'value',
      });
    });

    test('is chainable', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor);

      const result = builder.headers({
        'X-Custom': 'value',
      });

      expect(result).toBe(builder);
    });
  });

  describe('header', () => {
    test('sets single header', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor);

      builder.header('X-Custom', 'value');

      const config = builder.getConfig();
      expect(config.headers?.['X-Custom']).toBe('value');
    });

    test('is chainable', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor);

      const result = builder.header('X-Custom', 'value');

      expect(result).toBe(builder);
    });
  });

  describe('body', () => {
    test('sets request body', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('POST', '/api/users', executor);

      builder.body({
        name: 'John',
      });

      const config = builder.getConfig();
      expect(config.body).toEqual({
        name: 'John',
      });
    });

    test('is chainable', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('POST', '/api/users', executor);

      const result = builder.body({
        name: 'John',
      });

      expect(result).toBe(builder);
    });
  });

  describe('json', () => {
    test('sets body and content-type header', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('POST', '/api/users', executor);

      builder.json({
        name: 'John',
      });

      const config = builder.getConfig();
      expect(config.body).toEqual({
        name: 'John',
      });
      expect(config.headers?.['Content-Type']).toBe('application/json');
    });

    test('is chainable', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('POST', '/api/users', executor);

      const result = builder.json({
        name: 'John',
      });

      expect(result).toBe(builder);
    });
  });

  describe('timeout', () => {
    test('sets timeout', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor);

      builder.timeout(5000);

      const config = builder.getConfig();
      expect(config.timeout).toBe(5000);
    });

    test('is chainable', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor);

      const result = builder.timeout(5000);

      expect(result).toBe(builder);
    });
  });

  describe('cache', () => {
    test('sets cache options as object', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor);

      builder.cache({
        ttl: 60000,
        tags: [
          'users',
        ],
      });

      const config = builder.getConfig();
      expect(config.cache).toEqual({
        ttl: 60000,
        tags: [
          'users',
        ],
      });
    });

    test('sets cache ttl as number', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor);

      builder.cache(60000);

      const config = builder.getConfig();
      expect(config.cache).toEqual({
        ttl: 60000,
      });
    });

    test('is chainable', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor);

      const result = builder.cache(60000);

      expect(result).toBe(builder);
    });
  });

  describe('retry', () => {
    test('sets retry config', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor);

      builder.retry({
        maxAttempts: 3,
        backoff: 'exponential',
        delay: 1000,
      });

      const config = builder.getConfig();
      expect(config.retry).toEqual({
        maxAttempts: 3,
        backoff: 'exponential',
        delay: 1000,
      });
    });

    test('is chainable', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor);

      const result = builder.retry({
        maxAttempts: 3,
        backoff: 'linear',
        delay: 1000,
      });

      expect(result).toBe(builder);
    });
  });

  describe('signal', () => {
    test('sets abort signal', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor);
      const controller = new AbortController();

      builder.signal(controller.signal);

      const config = builder.getConfig();
      expect(config.signal).toBe(controller.signal);
    });

    test('is chainable', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor);
      const controller = new AbortController();

      const result = builder.signal(controller.signal);

      expect(result).toBe(builder);
    });
  });

  describe('fetchOptions', () => {
    test('sets custom fetch options', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor);

      builder.fetchOptions({
        credentials: 'include',
        mode: 'cors',
      });

      const config = builder.getConfig();
      expect(config.fetchOptions).toEqual({
        credentials: 'include',
        mode: 'cors',
      });
    });

    test('merges with existing fetch options', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor, {
        fetchOptions: {
          credentials: 'include',
        },
      });

      builder.fetchOptions({
        mode: 'cors',
      });

      const config = builder.getConfig();
      expect(config.fetchOptions).toEqual({
        credentials: 'include',
        mode: 'cors',
      });
    });

    test('is chainable', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor);

      const result = builder.fetchOptions({
        credentials: 'include',
      });

      expect(result).toBe(builder);
    });
  });

  describe('send', () => {
    test('executes request and returns response', async () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor);

      const response = await builder.send();

      expect(executor).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(200);
      expect(response.data).toEqual({
        success: true,
      });
    });

    test('passes built config to executor', async () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('POST', '/api/users', executor)
        .headers({
          'X-Custom': 'value',
        })
        .params({
          test: 'true',
        })
        .timeout(5000);

      await builder.send();

      const passedConfig = executor.mock.calls[0]?.[0];
      expect(passedConfig.method).toBe('POST');
      expect(passedConfig.url).toBe('/api/users');
      expect(passedConfig.headers).toEqual({
        'X-Custom': 'value',
      });
      expect(passedConfig.params).toEqual({
        test: 'true',
      });
      expect(passedConfig.timeout).toBe(5000);
    });
  });

  describe('data', () => {
    test('executes request and returns only data', async () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor);

      const data = await builder.data();

      expect(executor).toHaveBeenCalledTimes(1);
      expect(data).toEqual({
        success: true,
      });
    });
  });

  describe('getConfig', () => {
    test('returns a copy of config', () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('GET', '/api/users', executor);

      const config1 = builder.getConfig();
      const config2 = builder.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2);
    });
  });

  describe('chaining', () => {
    test('supports fluent API', async () => {
      const executor = createMockExecutor();
      const builder = new RequestBuilder('POST', '/api/users', executor);

      const response = await builder
        .headers({
          Authorization: 'Bearer token',
        })
        .header('X-Request-ID', '12345')
        .json({
          name: 'John',
          email: 'john@example.com',
        })
        .timeout(10000)
        .params({
          notify: true,
        })
        .send();

      expect(response.status).toBe(200);

      const passedConfig = executor.mock.calls[0]?.[0];
      expect(passedConfig.headers).toEqual({
        Authorization: 'Bearer token',
        'X-Request-ID': '12345',
        'Content-Type': 'application/json',
      });
      expect(passedConfig.body).toEqual({
        name: 'John',
        email: 'john@example.com',
      });
      expect(passedConfig.timeout).toBe(10000);
      expect(passedConfig.params).toEqual({
        notify: true,
      });
    });
  });
});
