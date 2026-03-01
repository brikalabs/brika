/**
 * Tests for HTTP interceptors
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  DeduplicationInterceptor,
  DeduplicationSkipError,
} from '../interceptors/builtin/deduplication';
import { RetryInterceptor } from '../interceptors/builtin/retry';
import { TimeoutInterceptor } from '../interceptors/builtin/timeout';
import type { HttpResponse, RequestConfig } from '../types';

describe('HTTP Interceptors', () => {
  describe('TimeoutInterceptor', () => {
    test('returns config without signal when no timeout specified', () => {
      const interceptor = new TimeoutInterceptor();
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com',
      };

      const result = interceptor.onRequest(config);

      expect(result.signal).toBeUndefined();
    });

    test('uses default timeout when config timeout not set', () => {
      const interceptor = new TimeoutInterceptor(5000);
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com',
      };

      const result = interceptor.onRequest(config);

      expect(result.signal).toBeDefined();
      expect(result.signal).toBeInstanceOf(AbortSignal);
    });

    test('uses config timeout over default', () => {
      const interceptor = new TimeoutInterceptor(5000);
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com',
        timeout: 10000,
      };

      const result = interceptor.onRequest(config);

      expect(result.signal).toBeDefined();
    });

    test('combines existing signal with timeout signal', () => {
      const interceptor = new TimeoutInterceptor(5000);
      const existingController = new AbortController();
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com',
        signal: existingController.signal,
      };

      const result = interceptor.onRequest(config);

      expect(result.signal).toBeDefined();
      expect(result.signal).not.toBe(existingController.signal);
    });

    test('aborts after timeout', async () => {
      const interceptor = new TimeoutInterceptor(50);
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com',
      };

      const result = interceptor.onRequest(config);

      await new Promise((r) => setTimeout(r, 100));

      expect(result.signal?.aborted).toBe(true);
    });
  });

  describe('DeduplicationInterceptor', () => {
    let interceptor: DeduplicationInterceptor;
    let mockFetch: ReturnType<typeof mock>;

    beforeEach(() => {
      mockFetch = mock().mockResolvedValue({
        data: {
          test: true,
        },
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        config: {} as RequestConfig,
        cached: false,
      } as HttpResponse);
      interceptor = new DeduplicationInterceptor(mockFetch);
    });

    test('passes through non-GET requests', async () => {
      const config: RequestConfig = {
        method: 'POST',
        url: 'https://example.com/api',
      };

      const result = await interceptor.onRequest(config);

      expect(result).toBe(config);
    });

    test('passes through GET requests when no pending', async () => {
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com/api',
      };

      const result = await interceptor.onRequest(config);

      expect(result).toBe(config);
    });

    test('registerRequest stores and cleans up pending requests', async () => {
      const promise = Promise.resolve({} as HttpResponse);

      interceptor.registerRequest('test-key', promise);

      expect(interceptor.hasPendingRequest('test-key')).toBe(true);

      await promise;
      // Wait for finally to run
      await new Promise((r) => setTimeout(r, 0));

      expect(interceptor.hasPendingRequest('test-key')).toBe(false);
    });

    test('getPendingRequest returns registered promise', () => {
      const promise = Promise.resolve({} as HttpResponse);
      interceptor.registerRequest('test-key', promise);

      const result = interceptor.getPendingRequest('test-key');

      expect(result).toBe(promise);
    });

    test('getPendingRequest returns undefined for unknown key', () => {
      const result = interceptor.getPendingRequest('unknown-key');

      expect(result).toBeUndefined();
    });

    test('hasPendingRequest returns correct state', () => {
      expect(interceptor.hasPendingRequest('key')).toBe(false);

      interceptor.registerRequest('key', Promise.resolve({} as HttpResponse));

      expect(interceptor.hasPendingRequest('key')).toBe(true);
    });

    test('clear removes all pending requests', () => {
      interceptor.registerRequest('key1', Promise.resolve({} as HttpResponse));
      interceptor.registerRequest('key2', Promise.resolve({} as HttpResponse));

      interceptor.clear();

      expect(interceptor.hasPendingRequest('key1')).toBe(false);
      expect(interceptor.hasPendingRequest('key2')).toBe(false);
    });

    test('throws DeduplicationSkipError when request is pending', async () => {
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com/api',
      };

      // Register a pending request with the same key
      const pendingPromise = new Promise<HttpResponse>((resolve) => {
        setTimeout(() => resolve({} as HttpResponse), 50);
      });

      // Generate the same key that would be used
      const { generateCacheKey } = await import('../cache');
      const key = generateCacheKey(config);
      interceptor.registerRequest(key, pendingPromise);

      await expect(interceptor.onRequest(config)).rejects.toThrow(DeduplicationSkipError);
    });
  });

  describe('DeduplicationSkipError', () => {
    test('has correct name and cache key', () => {
      const error = new DeduplicationSkipError('test-key');

      expect(error.name).toBe('DeduplicationSkipError');
      expect(error.cacheKey).toBe('test-key');
      expect(error.message).toContain('deduplication');
    });
  });

  describe('RetryInterceptor', () => {
    let interceptor: RetryInterceptor;
    let mockFetch: ReturnType<typeof mock>;

    beforeEach(() => {
      mockFetch = mock().mockResolvedValue({
        data: {
          success: true,
        },
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        config: {} as RequestConfig,
        cached: false,
      } as HttpResponse);
      interceptor = new RetryInterceptor(mockFetch);
    });

    test('throws error when no retry config', async () => {
      const { HttpError } = await import('../types');
      const error = new HttpError('Test error', 500);
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com',
      };

      await expect(interceptor.onError(error, config)).rejects.toThrow(error);
    });

    test('throws error when max attempts reached', async () => {
      const { HttpError } = await import('../types');
      const error = new HttpError('Server error', 500);
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com',
        retry: {
          maxAttempts: 0,
          backoff: 'linear',
          delay: 100,
        },
      };

      await expect(interceptor.onError(error, config)).rejects.toThrow(error);
    });

    test('retries on network errors', async () => {
      const { HttpError } = await import('../types');
      // Network error has undefined status
      const error = new HttpError('Network error', undefined);
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com',
        retry: {
          maxAttempts: 3,
          backoff: 'linear',
          delay: 10,
        },
      };

      const result = await interceptor.onError(error, config);

      expect(mockFetch).toHaveBeenCalled();
      expect(result.status).toBe(200);
    });

    test('retries on retryable status codes', async () => {
      const { HttpError } = await import('../types');
      const error = new HttpError('Server error', 500);
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com',
        retry: {
          maxAttempts: 3,
          backoff: 'linear',
          delay: 10,
        },
      };

      const result = await interceptor.onError(error, config);

      expect(mockFetch).toHaveBeenCalled();
      expect(result.status).toBe(200);
    });

    test('does not retry on non-retryable status codes', async () => {
      const { HttpError } = await import('../types');
      const error = new HttpError('Not found', 404);
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com',
        retry: {
          maxAttempts: 3,
          backoff: 'linear',
          delay: 10,
        },
      };

      await expect(interceptor.onError(error, config)).rejects.toThrow(error);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('respects custom shouldRetry function', async () => {
      const { HttpError } = await import('../types');
      const error = new HttpError('Custom error', 404);
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com',
        retry: {
          maxAttempts: 3,
          backoff: 'linear',
          delay: 10,
          shouldRetry: () => true, // Always retry
        },
      };

      const result = await interceptor.onError(error, config);

      expect(mockFetch).toHaveBeenCalled();
      expect(result.status).toBe(200);
    });

    test('applies exponential backoff', async () => {
      const { HttpError } = await import('../types');
      const error = new HttpError('Server error', 500);
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com',
        retry: {
          maxAttempts: 3,
          backoff: 'exponential',
          delay: 10,
        },
      };

      const startTime = Date.now();
      await interceptor.onError(error, config);
      const duration = Date.now() - startTime;

      // Should have some delay (exponential backoff with jitter)
      expect(duration).toBeGreaterThanOrEqual(5);
    });

    test('respects maxDelay option', async () => {
      const { HttpError } = await import('../types');
      const error = new HttpError('Server error', 500);
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com',
        retry: {
          maxAttempts: 3,
          backoff: 'exponential',
          delay: 1000,
          maxDelay: 50,
        },
      };

      const startTime = Date.now();
      await interceptor.onError(error, config);
      const duration = Date.now() - startTime;

      // Max delay is 50ms, so should not take too long
      expect(duration).toBeLessThan(200);
    });
  });
});
