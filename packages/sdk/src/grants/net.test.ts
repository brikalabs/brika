/**
 * Unit tests for `grants/net.ts` — fetch args refinement, header redaction,
 * single-flight defaults, and the placeholder handler.
 */

import { describe, expect, test } from 'bun:test';
import {
  FetchArgsSchema,
  FetchResultSchema,
  NetScopeSchema,
  NetSocketScopeSchema,
  netFetch,
  netSocket,
} from './net';

const stubHandlerCtx = {
  pluginUid: 'plugin-x',
  pluginRoot: '/plugins/x',
  grantedScope: { allow: [] },
  log: () => undefined,
  signal: new AbortController().signal,
};

describe('NetScopeSchema', () => {
  test('parses allow-list', () => {
    expect(NetScopeSchema.parse({ allow: ['*.example.com'] })).toEqual({
      allow: ['*.example.com'],
    });
  });
});

describe('FetchArgsSchema', () => {
  test('defaults method to GET', () => {
    const parsed = FetchArgsSchema.parse({ url: 'https://example.com' });
    expect(parsed.method).toBe('GET');
  });

  test('accepts all documented methods', () => {
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const) {
      const args =
        method === 'GET' || method === 'HEAD'
          ? { url: 'https://example.com', method }
          : { url: 'https://example.com', method, body: 'hi' };
      expect(FetchArgsSchema.parse(args).method).toBe(method);
    }
  });

  test('refuses body on GET', () => {
    expect(() =>
      FetchArgsSchema.parse({ url: 'https://example.com', method: 'GET', body: 'x' })
    ).toThrow(/body.*not allowed.*GET/i);
  });

  test('refuses body on HEAD', () => {
    expect(() =>
      FetchArgsSchema.parse({ url: 'https://example.com', method: 'HEAD', body: 'x' })
    ).toThrow();
  });

  test('rejects non-URL url', () => {
    expect(() => FetchArgsSchema.parse({ url: 'not a url' })).toThrow();
  });

  test('rejects oversized body', () => {
    const tooBig = 'a'.repeat(16 * 1024 * 1024 + 1);
    expect(() =>
      FetchArgsSchema.parse({ url: 'https://example.com', method: 'POST', body: tooBig })
    ).toThrow();
  });

  test('caps timeoutMs at 5 minutes', () => {
    expect(() =>
      FetchArgsSchema.parse({ url: 'https://example.com', timeoutMs: 5 * 60_000 + 1 })
    ).toThrow();
  });

  test('parses a fully-populated request', () => {
    const args = FetchArgsSchema.parse({
      url: 'https://example.com',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      timeoutMs: 1000,
      singleFlight: true,
      idempotencyKey: 'abc',
      retry: { maxAttempts: 3, respectRetryAfter: true, backoffMs: 100 },
      maxResponseBytes: 1024,
      maxRedirects: 2,
    });
    expect(args.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(args.retry?.maxAttempts).toBe(3);
  });
});

describe('FetchResultSchema', () => {
  test('parses a response', () => {
    const result = FetchResultSchema.parse({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/plain' },
      body: 'hi',
      attempts: 1,
    });
    expect(result.status).toBe(200);
  });
});

describe('netFetch spec', () => {
  test('redact.args replaces sensitive headers with <redacted>', () => {
    const summary = netFetch.spec.redact?.args?.({
      url: 'https://example.com',
      method: 'POST',
      headers: {
        Authorization: 'Bearer secret',
        'X-Api-Key': 'k',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(summary).toEqual({
      url: 'https://example.com',
      method: 'POST',
      headers: {
        Authorization: '<redacted>',
        'X-Api-Key': '<redacted>',
        'Content-Type': 'application/json',
      },
      bodyBytes: 2,
    });
  });

  test('redact.args handles missing headers + missing body', () => {
    const summary = netFetch.spec.redact?.args?.({
      url: 'https://example.com',
      method: 'GET',
    });
    expect(summary).toEqual({
      url: 'https://example.com',
      method: 'GET',
      headers: undefined,
      bodyBytes: 0,
    });
  });

  test('redact.result summarises bytes + redacts set-cookie + counts cookies (never logs values)', () => {
    const summary = netFetch.spec.redact?.result?.({
      status: 200,
      statusText: 'OK',
      headers: { 'set-cookie': 'session=abc', 'content-type': 'text/plain' },
      setCookies: ['a=1; path=/', 'b=2; path=/'],
      body: 'hello',
      attempts: 1,
    });
    expect(summary).toEqual({
      status: 200,
      statusText: 'OK',
      headers: { 'set-cookie': '<redacted>', 'content-type': 'text/plain' },
      setCookieCount: 2,
      bodyBytes: 5,
      attempts: 1,
    });
  });

  test('setCookies defaults to [] when absent (backward compat)', () => {
    const result = FetchResultSchema.parse({
      status: 200,
      statusText: 'OK',
      headers: {},
      body: '',
      attempts: 1,
    });
    expect(result.setCookies).toEqual([]);
  });

  test('SDK-side handler throws', () => {
    expect(() =>
      netFetch.handler(stubHandlerCtx, {
        url: 'https://example.com',
        method: 'GET',
      })
    ).toThrow(/SDK-side handler invoked/);
  });

  test('spec carries net permission with globe icon', () => {
    expect(netFetch.spec.permission?.name).toBe('net');
    expect(netFetch.spec.permission?.icon).toBe('globe');
  });
});

describe('netSocket spec', () => {
  test('empty scope schema accepts {}', () => {
    expect(NetSocketScopeSchema.safeParse({}).success).toBe(true);
  });

  test('declares the dev.brika.net.socket id under the rawSocket family', () => {
    expect(netSocket.spec.id).toBe('dev.brika.net.socket');
    expect(netSocket.spec.permission?.name).toBe('rawSocket');
    expect(netSocket.spec.permission?.icon).toBe('ethernet-port');
  });

  test('handler always throws: the grant is realised at the lockdown, never dispatched', () => {
    // net.socket's scope is the empty object, not net.fetch's { allow }.
    const ctx = { ...stubHandlerCtx, grantedScope: {} };
    expect(() => netSocket.handler(ctx, {})).toThrow(/never dispatched over IPC/);
  });
});
