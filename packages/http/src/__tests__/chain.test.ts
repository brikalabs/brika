/**
 * Tests for InterceptorChain
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { InterceptorChain } from '../interceptors/chain';
import type { ErrorInterceptor, RequestInterceptor, ResponseInterceptor } from '../interceptors/types';
import { HttpError, type HttpResponse, type RequestConfig } from '../types';

describe('InterceptorChain', () => {
  let chain: InterceptorChain;

  beforeEach(() => {
    chain = new InterceptorChain();
  });

  describe('addRequestInterceptor', () => {
    test('adds request interceptor', () => {
      const interceptor: RequestInterceptor = {
        onRequest: (config) => config,
      };

      chain.addRequestInterceptor(interceptor);

      expect(chain.getCounts().request).toBe(1);
    });

    test('adds multiple request interceptors', () => {
      const interceptor1: RequestInterceptor = { onRequest: (c) => c };
      const interceptor2: RequestInterceptor = { onRequest: (c) => c };

      chain.addRequestInterceptor(interceptor1);
      chain.addRequestInterceptor(interceptor2);

      expect(chain.getCounts().request).toBe(2);
    });
  });

  describe('addResponseInterceptor', () => {
    test('adds response interceptor', () => {
      const interceptor: ResponseInterceptor = {
        onResponse: (response) => response,
      };

      chain.addResponseInterceptor(interceptor);

      expect(chain.getCounts().response).toBe(1);
    });
  });

  describe('addErrorInterceptor', () => {
    test('adds error interceptor', () => {
      const interceptor: ErrorInterceptor = {
        onError: (error) => Promise.reject(error),
      };

      chain.addErrorInterceptor(interceptor);

      expect(chain.getCounts().error).toBe(1);
    });
  });

  describe('executeRequest', () => {
    test('executes request interceptors in order', async () => {
      const calls: number[] = [];
      const interceptor1: RequestInterceptor = {
        onRequest: (config) => {
          calls.push(1);
          return { ...config, headers: { ...config.headers, 'X-First': 'true' } };
        },
      };
      const interceptor2: RequestInterceptor = {
        onRequest: (config) => {
          calls.push(2);
          return { ...config, headers: { ...config.headers, 'X-Second': 'true' } };
        },
      };

      chain.addRequestInterceptor(interceptor1);
      chain.addRequestInterceptor(interceptor2);

      const config: RequestConfig = { method: 'GET', url: 'https://example.com' };
      const result = await chain.executeRequest(config);

      expect(calls).toEqual([1, 2]);
      expect(result.headers?.['X-First']).toBe('true');
      expect(result.headers?.['X-Second']).toBe('true');
    });

    test('passes modified config through chain', async () => {
      const interceptor1: RequestInterceptor = {
        onRequest: (config) => ({ ...config, params: { page: 1 } }),
      };
      const interceptor2: RequestInterceptor = {
        onRequest: (config) => ({ ...config, params: { ...config.params, limit: 10 } }),
      };

      chain.addRequestInterceptor(interceptor1);
      chain.addRequestInterceptor(interceptor2);

      const config: RequestConfig = { method: 'GET', url: 'https://example.com' };
      const result = await chain.executeRequest(config);

      expect(result.params).toEqual({ page: 1, limit: 10 });
    });

    test('handles async interceptors', async () => {
      const interceptor: RequestInterceptor = {
        onRequest: async (config) => {
          await new Promise((r) => setTimeout(r, 10));
          return { ...config, headers: { 'X-Async': 'true' } };
        },
      };

      chain.addRequestInterceptor(interceptor);

      const config: RequestConfig = { method: 'GET', url: 'https://example.com' };
      const result = await chain.executeRequest(config);

      expect(result.headers?.['X-Async']).toBe('true');
    });

    test('returns original config when no interceptors', async () => {
      const config: RequestConfig = { method: 'GET', url: 'https://example.com' };
      const result = await chain.executeRequest(config);

      expect(result).toEqual(config);
    });
  });

  describe('executeResponse', () => {
    test('executes response interceptors in order', async () => {
      const calls: number[] = [];
      const interceptor1: ResponseInterceptor = {
        onResponse: (response) => {
          calls.push(1);
          return response;
        },
      };
      const interceptor2: ResponseInterceptor = {
        onResponse: (response) => {
          calls.push(2);
          return response;
        },
      };

      chain.addResponseInterceptor(interceptor1);
      chain.addResponseInterceptor(interceptor2);

      const response: HttpResponse = {
        data: {},
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        config: { method: 'GET', url: 'https://example.com' },
        cached: false,
      };

      await chain.executeResponse(response);

      expect(calls).toEqual([1, 2]);
    });

    test('transforms response through chain', async () => {
      const interceptor: ResponseInterceptor = {
        onResponse: (response) => ({
          ...response,
          data: { transformed: true, original: response.data },
        }),
      };

      chain.addResponseInterceptor(interceptor);

      const response: HttpResponse = {
        data: { value: 1 },
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        config: { method: 'GET', url: 'https://example.com' },
        cached: false,
      };

      const result = await chain.executeResponse(response);

      expect(result.data).toEqual({ transformed: true, original: { value: 1 } });
    });

    test('handles async interceptors', async () => {
      const interceptor: ResponseInterceptor = {
        onResponse: async (response) => {
          await new Promise((r) => setTimeout(r, 10));
          return { ...response, data: { async: true } };
        },
      };

      chain.addResponseInterceptor(interceptor);

      const response: HttpResponse = {
        data: {},
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        config: { method: 'GET', url: 'https://example.com' },
        cached: false,
      };

      const result = await chain.executeResponse(response);

      expect(result.data).toEqual({ async: true });
    });
  });

  describe('executeError', () => {
    test('passes error to interceptors', async () => {
      const interceptor: ErrorInterceptor = {
        onError: (error) => {
          return Promise.reject(error);
        },
      };

      chain.addErrorInterceptor(interceptor);

      const error = new HttpError('Test error', 500);
      const config: RequestConfig = { method: 'GET', url: 'https://example.com' };

      await expect(chain.executeError(error, config)).rejects.toThrow(error);
    });

    test('interceptor can recover from error', async () => {
      const recoveredResponse: HttpResponse = {
        data: { recovered: true },
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        config: { method: 'GET', url: 'https://example.com' },
        cached: false,
      };

      const interceptor: ErrorInterceptor = {
        onError: () => Promise.resolve(recoveredResponse),
      };

      chain.addErrorInterceptor(interceptor);

      const error = new HttpError('Test error', 500);
      const config: RequestConfig = { method: 'GET', url: 'https://example.com' };

      const result = await chain.executeError(error, config);

      expect(result.data).toEqual({ recovered: true });
    });

    test('passes error to next interceptor if current throws', async () => {
      const interceptor1: ErrorInterceptor = {
        onError: () => {
          throw new HttpError('From interceptor 1', 501);
        },
      };
      const recoveredResponse: HttpResponse = {
        data: { recovered: true },
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        config: { method: 'GET', url: 'https://example.com' },
        cached: false,
      };
      const interceptor2: ErrorInterceptor = {
        onError: () => Promise.resolve(recoveredResponse),
      };

      chain.addErrorInterceptor(interceptor1);
      chain.addErrorInterceptor(interceptor2);

      const error = new HttpError('Original error', 500);
      const config: RequestConfig = { method: 'GET', url: 'https://example.com' };

      const result = await chain.executeError(error, config);

      expect(result.data).toEqual({ recovered: true });
    });

    test('rethrows error if no interceptor handles it', async () => {
      const interceptor1: ErrorInterceptor = {
        onError: (error) => Promise.reject(error),
      };
      const interceptor2: ErrorInterceptor = {
        onError: (error) => Promise.reject(error),
      };

      chain.addErrorInterceptor(interceptor1);
      chain.addErrorInterceptor(interceptor2);

      const error = new HttpError('Test error', 500);
      const config: RequestConfig = { method: 'GET', url: 'https://example.com' };

      await expect(chain.executeError(error, config)).rejects.toThrow('Test error');
    });

    test('throws last error when no interceptors', async () => {
      const error = new HttpError('Test error', 500);
      const config: RequestConfig = { method: 'GET', url: 'https://example.com' };

      await expect(chain.executeError(error, config)).rejects.toThrow(error);
    });

    test('handles non-Error thrown by interceptor', async () => {
      const interceptor1: ErrorInterceptor = {
        onError: () => {
          throw 'string error'; // Non-Error thrown
        },
      };
      const interceptor2: ErrorInterceptor = {
        onError: (error) => Promise.reject(error),
      };

      chain.addErrorInterceptor(interceptor1);
      chain.addErrorInterceptor(interceptor2);

      const error = new HttpError('Original error', 500);
      const config: RequestConfig = { method: 'GET', url: 'https://example.com' };

      // Should still throw the original error since string isn't an Error instance
      await expect(chain.executeError(error, config)).rejects.toThrow('Original error');
    });
  });

  describe('clear', () => {
    test('removes all interceptors', () => {
      chain.addRequestInterceptor({ onRequest: (c) => c });
      chain.addResponseInterceptor({ onResponse: (r) => r });
      chain.addErrorInterceptor({ onError: (e) => Promise.reject(e) });

      expect(chain.getCounts()).toEqual({ request: 1, response: 1, error: 1 });

      chain.clear();

      expect(chain.getCounts()).toEqual({ request: 0, response: 0, error: 0 });
    });
  });

  describe('getCounts', () => {
    test('returns correct counts', () => {
      chain.addRequestInterceptor({ onRequest: (c) => c });
      chain.addRequestInterceptor({ onRequest: (c) => c });
      chain.addResponseInterceptor({ onResponse: (r) => r });

      const counts = chain.getCounts();

      expect(counts).toEqual({ request: 2, response: 1, error: 0 });
    });
  });
});
