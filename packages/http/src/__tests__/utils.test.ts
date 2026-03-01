/**
 * Tests for HTTP utility functions
 */

import { describe, expect, test } from 'bun:test';
import { HttpError, type RequestConfig, TimeoutError } from '../types';
import {
  createHttpError,
  createNetworkError,
  createTimeoutError,
  isHttpError,
  isTimeoutError,
} from '../utils/errors';
import {
  fromHeadersInstance,
  getContentType,
  isJsonContentType,
  mergeHeaders,
  toHeadersInstance,
} from '../utils/headers';
import {
  addQueryParams,
  buildUrl,
  extractQueryParams,
  isAbsoluteUrl,
  replacePathParams,
} from '../utils/url-builder';

describe('errors', () => {
  describe('createHttpError', () => {
    test('creates error from response with status', async () => {
      const response = new Response('Not found', {
        status: 404,
        statusText: 'Not Found',
      });
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com',
      };

      const error = await createHttpError(response, config);

      expect(error).toBeInstanceOf(HttpError);
      expect(error.status).toBe(404);
      expect(error.config).toBe(config);
    });

    test('extracts message from JSON response', async () => {
      const response = new Response(
        JSON.stringify({
          message: 'User not found',
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const error = await createHttpError(response);

      expect(error.message).toBe('User not found');
    });

    test('extracts error field from JSON response', async () => {
      const response = new Response(
        JSON.stringify({
          error: 'Validation failed',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const error = await createHttpError(response);

      expect(error.message).toBe('Validation failed');
    });

    test('handles error object in JSON response', async () => {
      const response = new Response(
        JSON.stringify({
          error: {
            code: 'INVALID',
            details: 'Bad input',
          },
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const error = await createHttpError(response);

      expect(error.message).toContain('INVALID');
    });

    test('extracts message from text response', async () => {
      const response = new Response('Server error occurred', {
        status: 500,
      });

      const error = await createHttpError(response);

      expect(error.message).toBe('Server error occurred');
    });

    test('limits text message length', async () => {
      const longText = 'x'.repeat(500);
      const response = new Response(longText, {
        status: 500,
      });

      const error = await createHttpError(response);

      expect(error.message.length).toBeLessThanOrEqual(200);
    });

    test('handles empty response body', async () => {
      const response = new Response('', {
        status: 500,
        statusText: 'Internal Server Error',
      });

      const error = await createHttpError(response);

      expect(error.message).toContain('500');
    });

    test('handles JSON parse errors gracefully', async () => {
      const response = new Response('invalid json{', {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const error = await createHttpError(response);

      expect(error).toBeInstanceOf(HttpError);
      expect(error.status).toBe(500);
    });
  });

  describe('createTimeoutError', () => {
    test('creates timeout error', () => {
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com',
      };

      const error = createTimeoutError(5000, config);

      expect(error).toBeInstanceOf(TimeoutError);
      expect(error.timeout).toBe(5000);
      expect(error.config).toBe(config);
      expect(error.message).toContain('5000ms');
    });
  });

  describe('createNetworkError', () => {
    test('creates network error', () => {
      const config: RequestConfig = {
        method: 'GET',
        url: 'https://example.com',
      };
      const originalError = new Error('Failed to fetch');

      const error = createNetworkError(originalError, config);

      expect(error).toBeInstanceOf(HttpError);
      expect(error.status).toBeUndefined();
      expect(error.isNetworkError).toBe(true);
      expect(error.message).toContain('Failed to fetch');
    });
  });

  describe('isHttpError', () => {
    test('returns true for HttpError', () => {
      const error = new HttpError('Test', 500);
      expect(isHttpError(error)).toBe(true);
    });

    test('returns false for regular Error', () => {
      const error = new Error('Test');
      expect(isHttpError(error)).toBe(false);
    });

    test('returns false for non-error', () => {
      expect(isHttpError('string')).toBe(false);
      expect(isHttpError(null)).toBe(false);
      expect(isHttpError(undefined)).toBe(false);
    });
  });

  describe('isTimeoutError', () => {
    test('returns true for TimeoutError', () => {
      const error = new TimeoutError('Test', 5000);
      expect(isTimeoutError(error)).toBe(true);
    });

    test('returns false for HttpError', () => {
      const error = new HttpError('Test', 500);
      expect(isTimeoutError(error)).toBe(false);
    });

    test('returns false for regular Error', () => {
      const error = new Error('Test');
      expect(isTimeoutError(error)).toBe(false);
    });
  });
});

describe('headers', () => {
  describe('mergeHeaders', () => {
    test('merges multiple header objects', () => {
      const result = mergeHeaders(
        {
          'Content-Type': 'application/json',
        },
        {
          Authorization: 'Bearer token',
        }
      );

      expect(result).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      });
    });

    test('later headers override earlier', () => {
      const result = mergeHeaders(
        {
          'Content-Type': 'text/plain',
        },
        {
          'Content-Type': 'application/json',
        }
      );

      expect(result).toEqual({
        'Content-Type': 'application/json',
      });
    });

    test('handles undefined headers', () => {
      const result = mergeHeaders(
        undefined,
        {
          'X-Custom': 'value',
        },
        undefined
      );

      expect(result).toEqual({
        'X-Custom': 'value',
      });
    });

    test('returns empty object for no headers', () => {
      const result = mergeHeaders();

      expect(result).toEqual({});
    });
  });

  describe('toHeadersInstance', () => {
    test('converts object to Headers', () => {
      const headers = toHeadersInstance({
        'Content-Type': 'application/json',
      });

      expect(headers).toBeInstanceOf(Headers);
      expect(headers.get('Content-Type')).toBe('application/json');
    });

    test('handles undefined', () => {
      const headers = toHeadersInstance(undefined);

      expect(headers).toBeInstanceOf(Headers);
    });

    test('handles multiple headers', () => {
      const headers = toHeadersInstance({
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      });

      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('Authorization')).toBe('Bearer token');
    });
  });

  describe('fromHeadersInstance', () => {
    test('converts Headers to object', () => {
      const headers = new Headers();
      headers.set('Content-Type', 'application/json');
      headers.set('X-Custom', 'value');

      const result = fromHeadersInstance(headers);

      expect(result['content-type']).toBe('application/json');
      expect(result['x-custom']).toBe('value');
    });

    test('handles empty Headers', () => {
      const headers = new Headers();
      const result = fromHeadersInstance(headers);

      expect(result).toEqual({});
    });
  });

  describe('getContentType', () => {
    test('gets content type from Headers instance', () => {
      const headers = new Headers();
      headers.set('Content-Type', 'application/json');

      expect(getContentType(headers)).toBe('application/json');
    });

    test('gets content type from plain object', () => {
      const headers = {
        'Content-Type': 'application/json',
      };

      expect(getContentType(headers)).toBe('application/json');
    });

    test('handles case-insensitive keys', () => {
      const headers = {
        'content-type': 'text/html',
      };

      expect(getContentType(headers)).toBe('text/html');
    });

    test('returns null for undefined headers', () => {
      expect(getContentType(undefined)).toBeNull();
    });

    test('returns null when content-type not present', () => {
      const headers = {
        'X-Custom': 'value',
      };

      expect(getContentType(headers)).toBeNull();
    });
  });

  describe('isJsonContentType', () => {
    test('returns true for application/json', () => {
      expect(isJsonContentType('application/json')).toBe(true);
    });

    test('returns true for json with charset', () => {
      expect(isJsonContentType('application/json; charset=utf-8')).toBe(true);
    });

    test('returns false for text/html', () => {
      expect(isJsonContentType('text/html')).toBe(false);
    });

    test('returns false for null', () => {
      expect(isJsonContentType(null)).toBe(false);
    });
  });
});

describe('url-builder', () => {
  describe('buildUrl', () => {
    test('combines base URL and path', () => {
      const url = buildUrl('https://api.example.com', '/users');

      expect(url).toBe('https://api.example.com/users');
    });

    test('handles base URL with trailing slash', () => {
      const url = buildUrl('https://api.example.com/', '/users');

      expect(url).toBe('https://api.example.com/users');
    });

    test('handles path without leading slash', () => {
      const url = buildUrl('https://api.example.com', 'users');

      expect(url).toBe('https://api.example.com/users');
    });

    test('handles absolute URL path', () => {
      const url = buildUrl('https://api.example.com', 'https://other.com/users');

      expect(url).toBe('https://other.com/users');
    });

    test('handles undefined base URL', () => {
      const url = buildUrl(undefined, '/users');

      expect(url).toBe('/users');
    });

    test('adds query params', () => {
      const url = buildUrl('https://api.example.com', '/users', {
        page: 1,
        limit: 10,
      });

      expect(url).toBe('https://api.example.com/users?page=1&limit=10');
    });
  });

  describe('addQueryParams', () => {
    test('adds params to URL', () => {
      const url = addQueryParams('https://example.com/api', {
        foo: 'bar',
        baz: 123,
      });

      expect(url).toContain('foo=bar');
      expect(url).toContain('baz=123');
    });

    test('handles boolean params', () => {
      const url = addQueryParams('https://example.com/api', {
        active: true,
      });

      expect(url).toContain('active=true');
    });

    test('skips null and undefined params', () => {
      const url = addQueryParams('https://example.com/api', {
        foo: 'bar',
        nullVal: null,
        undefinedVal: undefined,
      });

      expect(url).toContain('foo=bar');
      expect(url).not.toContain('nullVal');
      expect(url).not.toContain('undefinedVal');
    });

    test('returns original URL when no params', () => {
      const url = addQueryParams('https://example.com/api', undefined);

      expect(url).toBe('https://example.com/api');
    });

    test('returns original URL for empty params', () => {
      const url = addQueryParams('https://example.com/api', {});

      expect(url).toBe('https://example.com/api');
    });

    test('handles relative URLs', () => {
      const url = addQueryParams('/api/users', {
        page: 1,
      });

      expect(url).toBe('/api/users?page=1');
    });
  });

  describe('replacePathParams', () => {
    test('replaces single param', () => {
      const result = replacePathParams('/users/:id', {
        id: '123',
      });

      expect(result).toBe('/users/123');
    });

    test('replaces multiple params', () => {
      const result = replacePathParams('/users/:userId/posts/:postId', {
        userId: '123',
        postId: '456',
      });

      expect(result).toBe('/users/123/posts/456');
    });

    test('encodes special characters', () => {
      const result = replacePathParams('/search/:query', {
        query: 'hello world',
      });

      expect(result).toBe('/search/hello%20world');
    });

    test('handles path with no params', () => {
      const result = replacePathParams('/users', {});

      expect(result).toBe('/users');
    });
  });

  describe('isAbsoluteUrl', () => {
    test('returns true for http URL', () => {
      expect(isAbsoluteUrl('http://example.com')).toBe(true);
    });

    test('returns true for https URL', () => {
      expect(isAbsoluteUrl('https://example.com')).toBe(true);
    });

    test('returns false for relative path', () => {
      expect(isAbsoluteUrl('/api/users')).toBe(false);
    });

    test('returns false for path without protocol', () => {
      expect(isAbsoluteUrl('example.com/api')).toBe(false);
    });

    test('handles case-insensitive protocol', () => {
      expect(isAbsoluteUrl('HTTPS://example.com')).toBe(true);
    });
  });

  describe('extractQueryParams', () => {
    test('extracts params from URL', () => {
      const params = extractQueryParams('https://example.com/api?foo=bar&baz=123');

      expect(params).toEqual({
        foo: 'bar',
        baz: '123',
      });
    });

    test('returns empty object for URL without params', () => {
      const params = extractQueryParams('https://example.com/api');

      expect(params).toEqual({});
    });

    test('handles relative URL', () => {
      const params = extractQueryParams('/api?page=1');

      expect(params).toEqual({
        page: '1',
      });
    });
  });
});

describe('HttpError', () => {
  describe('isNetworkError', () => {
    test('returns true when status is undefined', () => {
      const error = new HttpError('Network error', undefined);
      expect(error.isNetworkError).toBe(true);
    });

    test('returns false when status is defined', () => {
      const error = new HttpError('Server error', 500);
      expect(error.isNetworkError).toBe(false);
    });
  });

  describe('isClientError', () => {
    test('returns true for 4xx status', () => {
      expect(new HttpError('Not found', 404).isClientError).toBe(true);
      expect(new HttpError('Bad request', 400).isClientError).toBe(true);
      expect(new HttpError('Unauthorized', 401).isClientError).toBe(true);
    });

    test('returns false for 5xx status', () => {
      expect(new HttpError('Server error', 500).isClientError).toBe(false);
    });

    test('returns false for undefined status', () => {
      expect(new HttpError('Network error', undefined).isClientError).toBe(false);
    });
  });

  describe('isServerError', () => {
    test('returns true for 5xx status', () => {
      expect(new HttpError('Server error', 500).isServerError).toBe(true);
      expect(new HttpError('Bad gateway', 502).isServerError).toBe(true);
      expect(new HttpError('Service unavailable', 503).isServerError).toBe(true);
    });

    test('returns false for 4xx status', () => {
      expect(new HttpError('Not found', 404).isServerError).toBe(false);
    });

    test('returns false for undefined status', () => {
      expect(new HttpError('Network error', undefined).isServerError).toBe(false);
    });
  });

  describe('isRetryable', () => {
    test('returns true for network errors', () => {
      expect(new HttpError('Network error', undefined).isRetryable).toBe(true);
    });

    test('returns true for retryable status codes', () => {
      expect(new HttpError('Request timeout', 408).isRetryable).toBe(true);
      expect(new HttpError('Too many requests', 429).isRetryable).toBe(true);
      expect(new HttpError('Internal server error', 500).isRetryable).toBe(true);
      expect(new HttpError('Bad gateway', 502).isRetryable).toBe(true);
      expect(new HttpError('Service unavailable', 503).isRetryable).toBe(true);
      expect(new HttpError('Gateway timeout', 504).isRetryable).toBe(true);
    });

    test('returns false for non-retryable status codes', () => {
      expect(new HttpError('Not found', 404).isRetryable).toBe(false);
      expect(new HttpError('Unauthorized', 401).isRetryable).toBe(false);
      expect(new HttpError('Forbidden', 403).isRetryable).toBe(false);
    });
  });
});

describe('TimeoutError', () => {
  test('has correct name', () => {
    const error = new TimeoutError('Timeout', 5000);
    expect(error.name).toBe('TimeoutError');
  });

  test('stores timeout value', () => {
    const error = new TimeoutError('Timeout', 5000);
    expect(error.timeout).toBe(5000);
  });

  test('inherits from HttpError', () => {
    const error = new TimeoutError('Timeout', 5000);
    expect(error).toBeInstanceOf(HttpError);
  });
});
