import { describe, expect, test } from 'bun:test';
import { filterPluginResponseHeaders } from '@/runtime/http/utils/header-allowlist';

describe('filterPluginResponseHeaders', () => {
  test('keeps safe content + caching headers', () => {
    const out = filterPluginResponseHeaders(
      {
        'Content-Type': 'application/json',
        'Content-Language': 'fr-FR',
        'Content-Encoding': 'gzip',
        'Cache-Control': 'no-cache',
        ETag: 'W/"abc"',
        'Last-Modified': 'Wed, 21 Oct 2025 07:28:00 GMT',
        Vary: 'Accept-Encoding',
      },
      200
    );
    expect(out).toEqual({
      'content-type': 'application/json',
      'content-language': 'fr-FR',
      'content-encoding': 'gzip',
      'cache-control': 'no-cache',
      etag: 'W/"abc"',
      'last-modified': 'Wed, 21 Oct 2025 07:28:00 GMT',
      vary: 'Accept-Encoding',
    });
  });

  test('keeps CORS headers (plugins may serve cross-origin assets)', () => {
    const out = filterPluginResponseHeaders(
      {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Expose-Headers': 'X-Total-Count',
        'Access-Control-Max-Age': '600',
      },
      200
    );
    expect(Object.keys(out).sort()).toEqual([
      'access-control-allow-credentials',
      'access-control-allow-headers',
      'access-control-allow-methods',
      'access-control-allow-origin',
      'access-control-expose-headers',
      'access-control-max-age',
    ]);
  });

  test('drops Set-Cookie, Authorization, CSP, HSTS, X-Frame-Options', () => {
    const out = filterPluginResponseHeaders(
      {
        'Set-Cookie': 'session=hijack; Path=/',
        Authorization: 'Bearer hijack',
        'Content-Security-Policy': "default-src 'none'",
        'Strict-Transport-Security': 'max-age=0',
        'X-Frame-Options': 'ALLOWALL',
        'X-Custom-Header': 'whatever',
      },
      200
    );
    expect(out).toEqual({});
  });

  test('Location allowed on 3xx, dropped on other statuses', () => {
    expect(filterPluginResponseHeaders({ Location: '/elsewhere' }, 302)).toEqual({
      location: '/elsewhere',
    });
    expect(filterPluginResponseHeaders({ Location: '/elsewhere' }, 200)).toEqual({});
    expect(filterPluginResponseHeaders({ Location: '/elsewhere' }, 400)).toEqual({});
    expect(filterPluginResponseHeaders({ Location: '/elsewhere' }, 301)).toEqual({
      location: '/elsewhere',
    });
  });

  test('header names normalize to lowercase', () => {
    const out = filterPluginResponseHeaders({ 'CONTENT-TYPE': 'text/plain' }, 200);
    expect(out).toEqual({ 'content-type': 'text/plain' });
  });

  test('undefined or empty headers map returns empty object', () => {
    expect(filterPluginResponseHeaders(undefined, 200)).toEqual({});
    expect(filterPluginResponseHeaders({}, 200)).toEqual({});
  });
});
