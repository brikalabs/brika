import { describe, expect, mock, test } from 'bun:test';
import {
  extractBody,
  extractHeaders,
  extractQuery,
  proxyToPlugin,
} from '@/runtime/http/utils/route-proxy';
import type { PluginProcess } from '@/runtime/plugins/plugin-process';

// ─────────────────────────────────────────────────────────────────────────────
// extractQuery
// ─────────────────────────────────────────────────────────────────────────────

describe('extractQuery', () => {
  test('returns an empty record when there are no search params', () => {
    const url = new URL('https://example.com/path');

    const result = extractQuery(url);

    expect(result).toEqual({});
  });

  test('extracts a single query parameter', () => {
    const url = new URL('https://example.com/path?foo=bar');

    const result = extractQuery(url);

    expect(result).toEqual({
      foo: 'bar',
    });
  });

  test('extracts multiple query parameters', () => {
    const url = new URL('https://example.com/path?a=1&b=2&c=3');

    const result = extractQuery(url);

    expect(result).toEqual({
      a: '1',
      b: '2',
      c: '3',
    });
  });

  test('keeps only the last value for duplicate keys', () => {
    const url = new URL('https://example.com/path?key=first&key=second');

    const result = extractQuery(url);

    expect(result).toEqual({
      key: 'second',
    });
  });

  test('handles URL-encoded values', () => {
    const url = new URL('https://example.com/path?q=hello%20world&tag=%26special');

    const result = extractQuery(url);

    expect(result).toEqual({
      q: 'hello world',
      tag: '&special',
    });
  });

  test('handles empty-string values', () => {
    const url = new URL('https://example.com/path?empty=');

    const result = extractQuery(url);

    expect(result).toEqual({
      empty: '',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractHeaders
// ─────────────────────────────────────────────────────────────────────────────

describe('extractHeaders', () => {
  test('picks only forwarded headers from the request', () => {
    const req = new Request('https://example.com', {
      headers: {
        'content-type': 'application/json',
        accept: 'text/html',
        authorization: 'Bearer tok',
        'user-agent': 'TestAgent/1.0',
        host: 'example.com',
        'x-forwarded-proto': 'https',
        'x-custom-header': 'should-be-ignored',
      },
    });
    const url = new URL('https://example.com');

    const result = extractHeaders(req, url, 'plugin-123');

    expect(result['content-type']).toBe('application/json');
    expect(result['accept']).toBe('text/html');
    expect(result['authorization']).toBe('Bearer tok');
    expect(result['user-agent']).toBe('TestAgent/1.0');
    expect(result['host']).toBe('example.com');
    expect(result['x-forwarded-proto']).toBe('https');
    expect(result['x-custom-header']).toBeUndefined();
  });

  test('always sets x-plugin-uid', () => {
    const req = new Request('https://example.com');
    const url = new URL('https://example.com');

    const result = extractHeaders(req, url, 'my-uid');

    expect(result['x-plugin-uid']).toBe('my-uid');
  });

  test('infers x-forwarded-proto from URL when not present in request', () => {
    const req = new Request('https://example.com');
    const url = new URL('https://example.com');

    const result = extractHeaders(req, url, 'uid');

    expect(result['x-forwarded-proto']).toBe('https');
  });

  test('infers http protocol when URL is http', () => {
    const req = new Request('http://localhost:3000');
    const url = new URL('http://localhost:3000');

    const result = extractHeaders(req, url, 'uid');

    expect(result['x-forwarded-proto']).toBe('http');
  });

  test('does not override x-forwarded-proto when already set', () => {
    const req = new Request('http://localhost', {
      headers: {
        'x-forwarded-proto': 'https',
      },
    });
    const url = new URL('http://localhost');

    const result = extractHeaders(req, url, 'uid');

    expect(result['x-forwarded-proto']).toBe('https');
  });

  test('omits headers that are absent from the request', () => {
    const req = new Request('https://example.com');
    const url = new URL('https://example.com');

    const result = extractHeaders(req, url, 'uid');

    expect(result['authorization']).toBeUndefined();
    expect(result['content-type']).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractBody
// ─────────────────────────────────────────────────────────────────────────────

describe('extractBody', () => {
  test('returns undefined for GET requests', async () => {
    const req = new Request('https://example.com', {
      method: 'GET',
    });

    const result = await extractBody(req);

    expect(result).toBeUndefined();
  });

  test('returns undefined for HEAD requests', async () => {
    const req = new Request('https://example.com', {
      method: 'HEAD',
    });

    const result = await extractBody(req);

    expect(result).toBeUndefined();
  });

  test('returns undefined when content-type is not application/json', async () => {
    const req = new Request('https://example.com', {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
      },
      body: 'hello',
    });

    const result = await extractBody(req);

    expect(result).toBeUndefined();
  });

  test('returns undefined when content-type is missing', async () => {
    const req = new Request('https://example.com', {
      method: 'POST',
      body: '{"a":1}',
    });

    const result = await extractBody(req);

    expect(result).toBeUndefined();
  });

  test('parses JSON body for POST requests', async () => {
    const req = new Request('https://example.com', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        key: 'value',
      }),
    });

    const result = await extractBody(req);

    expect(result).toEqual({
      key: 'value',
    });
  });

  test('parses JSON body for PUT requests', async () => {
    const req = new Request('https://example.com', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        updated: true,
      }),
    });

    const result = await extractBody(req);

    expect(result).toEqual({
      updated: true,
    });
  });

  test('parses JSON body for DELETE requests', async () => {
    const req = new Request('https://example.com', {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: 42,
      }),
    });

    const result = await extractBody(req);

    expect(result).toEqual({
      id: 42,
    });
  });

  test('handles content-type with charset parameter', async () => {
    const req = new Request('https://example.com', {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        ok: true,
      }),
    });

    const result = await extractBody(req);

    expect(result).toEqual({
      ok: true,
    });
  });

  test('returns undefined when body is invalid JSON', async () => {
    const req = new Request('https://example.com', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: 'not valid json{{{',
    });

    const result = await extractBody(req);

    expect(result).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// proxyToPlugin
// ─────────────────────────────────────────────────────────────────────────────

describe('proxyToPlugin', () => {
  function createMockProcess(response: {
    status: number;
    headers?: Record<string, string>;
    body?: unknown;
  }) {
    return {
      sendRouteRequest: mock(() => Promise.resolve(response)),
    } as unknown as PluginProcess;
  }

  test('forwards arguments to process.sendRouteRequest', async () => {
    const proc = createMockProcess({
      status: 200,
    });
    const query = {
      q: 'test',
    };
    const headers = {
      'content-type': 'application/json',
    };
    const body = {
      data: 1,
    };

    await proxyToPlugin(proc, 'route-1', 'POST', '/api/items', query, headers, body);

    expect(proc.sendRouteRequest).toHaveBeenCalledWith(
      'route-1',
      'POST',
      '/api/items',
      query,
      headers,
      body
    );
  });

  test('returns a Response with the correct status', async () => {
    const proc = createMockProcess({
      status: 201,
    });

    const res = await proxyToPlugin(proc, 'r', 'GET', '/', {}, {});

    expect(res.status).toBe(201);
  });

  test('uses Content-Type from result headers (title case)', async () => {
    const proc = createMockProcess({
      status: 200,
      headers: {
        'Content-Type': 'text/html',
      },
    });

    const res = await proxyToPlugin(proc, 'r', 'GET', '/', {}, {});

    expect(res.headers.get('Content-Type')).toBe('text/html');
  });

  test('uses content-type from result headers (lower case)', async () => {
    const proc = createMockProcess({
      status: 200,
      headers: {
        'content-type': 'text/plain',
      },
    });

    const res = await proxyToPlugin(proc, 'r', 'GET', '/', {}, {});

    // The function sets Content-Type from the resolved value AND spreads result.headers,
    // so when result.headers has lowercase 'content-type' the Response merges both values.
    expect(res.headers.get('Content-Type')).toBe('text/plain, text/plain');
  });

  test('defaults Content-Type to application/json when no headers provided', async () => {
    const proc = createMockProcess({
      status: 200,
    });

    const res = await proxyToPlugin(proc, 'r', 'GET', '/', {}, {});

    expect(res.headers.get('Content-Type')).toBe('application/json');
  });

  test('returns null body when result.body is null', async () => {
    const proc = createMockProcess({
      status: 204,
      body: null,
    });

    const res = await proxyToPlugin(proc, 'r', 'GET', '/', {}, {});

    expect(await res.text()).toBe('');
  });

  test('returns null body when result.body is undefined', async () => {
    const proc = createMockProcess({
      status: 204,
    });

    const res = await proxyToPlugin(proc, 'r', 'GET', '/', {}, {});

    expect(await res.text()).toBe('');
  });

  test('passes string body through as-is', async () => {
    const proc = createMockProcess({
      status: 200,
      body: '<h1>Hello</h1>',
    });

    const res = await proxyToPlugin(proc, 'r', 'GET', '/', {}, {});

    expect(await res.text()).toBe('<h1>Hello</h1>');
  });

  test('serializes object body to JSON', async () => {
    const proc = createMockProcess({
      status: 200,
      body: {
        items: [1, 2, 3],
      },
    });

    const res = await proxyToPlugin(proc, 'r', 'GET', '/', {}, {});

    expect(await res.json()).toEqual({
      items: [1, 2, 3],
    });
  });

  test('serializes array body to JSON', async () => {
    const proc = createMockProcess({
      status: 200,
      body: [1, 2, 3],
    });

    const res = await proxyToPlugin(proc, 'r', 'GET', '/', {}, {});

    expect(await res.json()).toEqual([1, 2, 3]);
  });

  test('spreads extra result headers onto the response', async () => {
    const proc = createMockProcess({
      status: 200,
      headers: {
        'X-Custom': 'value',
        'Content-Type': 'text/plain',
      },
    });

    const res = await proxyToPlugin(proc, 'r', 'GET', '/', {}, {});

    expect(res.headers.get('X-Custom')).toBe('value');
    expect(res.headers.get('Content-Type')).toBe('text/plain');
  });

  test('works without body argument', async () => {
    const proc = createMockProcess({
      status: 200,
      body: {
        ok: true,
      },
    });

    const res = await proxyToPlugin(proc, 'r', 'GET', '/', {}, {});

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
    });
  });
});
