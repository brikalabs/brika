import { describe, expect, test } from 'bun:test';
import { filterPluginResponseHeaders } from '../header-allowlist';

describe('filterPluginResponseHeaders', () => {
  test('returns an empty record when headers is undefined', () => {
    expect(filterPluginResponseHeaders(undefined, 200)).toEqual({});
  });

  test('returns an empty record when headers is empty', () => {
    expect(filterPluginResponseHeaders({}, 200)).toEqual({});
  });

  // ── Allowed headers ──────────────────────────────────────────────────────

  test('passes Content-Type through', () => {
    expect(filterPluginResponseHeaders({ 'Content-Type': 'text/html' }, 200)).toEqual({
      'Content-Type': 'text/html',
    });
  });

  test('passes Cache-Control, ETag, Last-Modified, Vary through', () => {
    const result = filterPluginResponseHeaders(
      {
        'Cache-Control': 'no-store',
        ETag: 'W/"abc"',
        'Last-Modified': 'Wed, 21 Oct 2026 07:28:00 GMT',
        Vary: 'Accept-Encoding',
      },
      200
    );
    expect(result).toEqual({
      'Cache-Control': 'no-store',
      ETag: 'W/"abc"',
      'Last-Modified': 'Wed, 21 Oct 2026 07:28:00 GMT',
      Vary: 'Accept-Encoding',
    });
  });

  test('passes Content-Language and Content-Encoding through', () => {
    expect(
      filterPluginResponseHeaders(
        { 'Content-Language': 'en-US', 'Content-Encoding': 'gzip' },
        200
      )
    ).toEqual({ 'Content-Language': 'en-US', 'Content-Encoding': 'gzip' });
  });

  test('passes CORS Access-Control-* headers through', () => {
    const result = filterPluginResponseHeaders(
      {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Expose-Headers': 'X-Total',
        'Access-Control-Max-Age': '86400',
      },
      200
    );
    expect(result).toEqual({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Expose-Headers': 'X-Total',
      'Access-Control-Max-Age': '86400',
    });
  });

  test('is case-insensitive when matching the allowlist', () => {
    expect(
      filterPluginResponseHeaders(
        { 'content-type': 'application/json', CACHE_CONTROL: 'no-store' },
        200
      )
    ).toEqual({ 'content-type': 'application/json' });
  });

  test('preserves the plugin-supplied casing on output', () => {
    expect(filterPluginResponseHeaders({ 'CoNtEnT-tYpE': 'text/plain' }, 200)).toEqual({
      'CoNtEnT-tYpE': 'text/plain',
    });
  });

  // ── Blocked headers ──────────────────────────────────────────────────────

  test('drops Set-Cookie', () => {
    expect(filterPluginResponseHeaders({ 'Set-Cookie': 'session=hijack' }, 200)).toEqual({});
  });

  test('drops Content-Security-Policy and CSP-Report-Only', () => {
    expect(
      filterPluginResponseHeaders(
        {
          'Content-Security-Policy': "default-src 'none'",
          'Content-Security-Policy-Report-Only': "default-src 'none'",
        },
        200
      )
    ).toEqual({});
  });

  test('drops Strict-Transport-Security', () => {
    expect(
      filterPluginResponseHeaders({ 'Strict-Transport-Security': 'max-age=31536000' }, 200)
    ).toEqual({});
  });

  test('drops X-Frame-Options', () => {
    expect(filterPluginResponseHeaders({ 'X-Frame-Options': 'DENY' }, 200)).toEqual({});
  });

  test('drops Authorization', () => {
    expect(filterPluginResponseHeaders({ Authorization: 'Bearer evil' }, 200)).toEqual({});
  });

  test('drops Server and X-Powered-By', () => {
    expect(
      filterPluginResponseHeaders({ Server: 'nginx/1.0', 'X-Powered-By': 'Bun' }, 200)
    ).toEqual({});
  });

  test('does not auto-allow arbitrary X- headers', () => {
    expect(
      filterPluginResponseHeaders(
        { 'X-Custom-Plugin-Header': 'value', 'X-Anything': 'else' },
        200
      )
    ).toEqual({});
  });

  // ── Location special case ────────────────────────────────────────────────

  test('allows Location on 301', () => {
    expect(filterPluginResponseHeaders({ Location: '/elsewhere' }, 301)).toEqual({
      Location: '/elsewhere',
    });
  });

  test('allows Location on 302', () => {
    expect(filterPluginResponseHeaders({ Location: 'https://x.test' }, 302)).toEqual({
      Location: 'https://x.test',
    });
  });

  test('allows Location on 307 and 308', () => {
    expect(filterPluginResponseHeaders({ Location: '/a' }, 307)).toEqual({ Location: '/a' });
    expect(filterPluginResponseHeaders({ Location: '/b' }, 308)).toEqual({ Location: '/b' });
  });

  test('drops Location on 200', () => {
    expect(filterPluginResponseHeaders({ Location: 'https://evil.test' }, 200)).toEqual({});
  });

  test('drops Location on 400', () => {
    expect(filterPluginResponseHeaders({ Location: 'https://evil.test' }, 400)).toEqual({});
  });

  test('drops Location on 500', () => {
    expect(filterPluginResponseHeaders({ Location: 'https://evil.test' }, 500)).toEqual({});
  });

  test('Location case-insensitive match on 302', () => {
    expect(filterPluginResponseHeaders({ location: '/path' }, 302)).toEqual({ location: '/path' });
  });

  // ── Mixed scenarios ──────────────────────────────────────────────────────

  test('passes safe headers and drops dangerous ones in the same payload', () => {
    const result = filterPluginResponseHeaders(
      {
        'Content-Type': 'text/html',
        'Set-Cookie': 'session=evil',
        'Content-Security-Policy': "default-src 'none'",
        'Cache-Control': 'no-store',
      },
      200
    );
    expect(result).toEqual({
      'Content-Type': 'text/html',
      'Cache-Control': 'no-store',
    });
  });

  test('OAuth authorize redirect: Location + Content-Type pass on 302', () => {
    const result = filterPluginResponseHeaders(
      {
        Location: 'https://accounts.spotify.com/authorize?client_id=x&state=y',
      },
      302
    );
    expect(result).toEqual({
      Location: 'https://accounts.spotify.com/authorize?client_id=x&state=y',
    });
  });
});
