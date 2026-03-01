/**
 * Tests for LoggerInterceptor
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { LoggerInterceptor } from '../interceptors/builtin/logger';
import { HttpError, type HttpResponse, type RequestConfig } from '../types';

describe('LoggerInterceptor', () => {
  describe('constructor', () => {
    test('uses default options when none provided', () => {
      const interceptor = new LoggerInterceptor();
      expect(interceptor).toBeDefined();
    });

    test('accepts custom options', () => {
      const customLogger = {
        log: mock(),
        error: mock(),
      };
      const interceptor = new LoggerInterceptor({
        logRequests: false,
        logResponses: false,
        logErrors: false,
        logger: customLogger,
      });
      expect(interceptor).toBeDefined();
    });
  });

  describe('onRequest', () => {
    test('logs request when logRequests is true', () => {
      const mockLogger = {
        log: mock(),
        error: mock(),
      };
      const interceptor = new LoggerInterceptor({
        logRequests: true,
        logger: mockLogger,
      });
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com/api',
        params: {
          page: 1,
        },
        headers: {
          'X-Custom': 'header',
        },
      };

      const result = interceptor.onRequest(config);

      expect(result).toBe(config);
      expect(mockLogger.log).toHaveBeenCalledTimes(1);
      expect(mockLogger.log.mock.calls[0]?.[0]).toContain('GET');
      expect(mockLogger.log.mock.calls[0]?.[0]).toContain('https://example.com/api');
    });

    test('does not log when logRequests is false', () => {
      const mockLogger = {
        log: mock(),
        error: mock(),
      };
      const interceptor = new LoggerInterceptor({
        logRequests: false,
        logger: mockLogger,
      });
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com/api',
      };

      const result = interceptor.onRequest(config);

      expect(result).toBe(config);
      expect(mockLogger.log).not.toHaveBeenCalled();
    });

    test('logs request body', () => {
      const mockLogger = {
        log: mock(),
        error: mock(),
      };
      const interceptor = new LoggerInterceptor({
        logRequests: true,
        logger: mockLogger,
      });
      const config: RequestConfig = {
        method: 'POST',
        url: 'https://example.com/api',
        body: {
          data: 'test',
        },
      };

      interceptor.onRequest(config);

      expect(mockLogger.log).toHaveBeenCalledTimes(1);
      const loggedData = mockLogger.log.mock.calls[0]?.[1];
      expect(loggedData.body).toEqual({
        data: 'test',
      });
    });
  });

  describe('onResponse', () => {
    test('logs response when logResponses is true', () => {
      const mockLogger = {
        log: mock(),
        error: mock(),
      };
      const interceptor = new LoggerInterceptor({
        logResponses: true,
        logger: mockLogger,
      });
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com/api',
      };
      const response: HttpResponse = {
        data: {
          result: 'success',
        },
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        config,
        cached: false,
      };

      const result = interceptor.onResponse(response);

      expect(result).toBe(response);
      expect(mockLogger.log).toHaveBeenCalledTimes(1);
      expect(mockLogger.log.mock.calls[0]?.[0]).toContain('200');
      expect(mockLogger.log.mock.calls[0]?.[0]).toContain('GET');
    });

    test('does not log when logResponses is false', () => {
      const mockLogger = {
        log: mock(),
        error: mock(),
      };
      const interceptor = new LoggerInterceptor({
        logResponses: false,
        logger: mockLogger,
      });
      const response: HttpResponse = {
        data: {},
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        config: {
          method: 'GET',
          url: 'https://example.com',
        },
        cached: false,
      };

      const result = interceptor.onResponse(response);

      expect(result).toBe(response);
      expect(mockLogger.log).not.toHaveBeenCalled();
    });

    test('logs cached status', () => {
      const mockLogger = {
        log: mock(),
        error: mock(),
      };
      const interceptor = new LoggerInterceptor({
        logResponses: true,
        logger: mockLogger,
      });
      const response: HttpResponse = {
        data: {},
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        config: {
          method: 'GET',
          url: 'https://example.com',
        },
        cached: true,
      };

      interceptor.onResponse(response);

      const loggedData = mockLogger.log.mock.calls[0]?.[1];
      expect(loggedData.cached).toBe(true);
    });

    test('calculates request duration', () => {
      const mockLogger = {
        log: mock(),
        error: mock(),
      };
      const interceptor = new LoggerInterceptor({
        logRequests: true,
        logResponses: true,
        logger: mockLogger,
      });
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com/api',
      };

      // Register request first to record timestamp
      interceptor.onRequest(config);

      const response: HttpResponse = {
        data: {},
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        config,
        cached: false,
      };

      interceptor.onResponse(response);

      // Check that duration is included (ends with 'ms)')
      expect(mockLogger.log.mock.calls[1]?.[0]).toMatch(/\(\d+ms\)/);
    });
  });

  describe('onError', () => {
    test('logs error when logErrors is true', async () => {
      const mockLogger = {
        log: mock(),
        error: mock(),
      };
      const interceptor = new LoggerInterceptor({
        logErrors: true,
        logger: mockLogger,
      });
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com/api',
      };
      const error = new HttpError('Not found', 404);

      await expect(interceptor.onError(error, config)).rejects.toThrow(error);
      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      expect(mockLogger.error.mock.calls[0]?.[0]).toContain('GET');
      expect(mockLogger.error.mock.calls[0]?.[0]).toContain('https://example.com/api');
    });

    test('does not log when logErrors is false', async () => {
      const mockLogger = {
        log: mock(),
        error: mock(),
      };
      const interceptor = new LoggerInterceptor({
        logErrors: false,
        logger: mockLogger,
      });
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com/api',
      };
      const error = new HttpError('Not found', 404);

      await expect(interceptor.onError(error, config)).rejects.toThrow(error);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    test('logs error details', async () => {
      const mockLogger = {
        log: mock(),
        error: mock(),
      };
      const interceptor = new LoggerInterceptor({
        logErrors: true,
        logger: mockLogger,
      });
      const config: RequestConfig = {
        method: 'POST',
        url: 'https://example.com/api',
      };
      const error = new HttpError('Server error', 500);

      await expect(interceptor.onError(error, config)).rejects.toThrow(error);

      const loggedData = mockLogger.error.mock.calls[0]?.[1];
      expect(loggedData.message).toBe('Server error');
      expect(loggedData.status).toBe(500);
      expect(loggedData.isNetworkError).toBe(false);
      expect(loggedData.isRetryable).toBe(true);
    });

    test('logs network error', async () => {
      const mockLogger = {
        log: mock(),
        error: mock(),
      };
      const interceptor = new LoggerInterceptor({
        logErrors: true,
        logger: mockLogger,
      });
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com/api',
      };
      const error = new HttpError('Network error', undefined);

      await expect(interceptor.onError(error, config)).rejects.toThrow(error);

      const loggedData = mockLogger.error.mock.calls[0]?.[1];
      expect(loggedData.isNetworkError).toBe(true);
    });

    test('calculates error duration when request was logged', async () => {
      const mockLogger = {
        log: mock(),
        error: mock(),
      };
      const interceptor = new LoggerInterceptor({
        logRequests: true,
        logErrors: true,
        logger: mockLogger,
      });
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com/api',
      };

      // Register request first
      interceptor.onRequest(config);

      const error = new HttpError('Error', 500);
      await expect(interceptor.onError(error, config)).rejects.toThrow(error);

      // Check that duration is included
      expect(mockLogger.error.mock.calls[0]?.[0]).toMatch(/\(\d+ms\)/);
    });
  });
});
