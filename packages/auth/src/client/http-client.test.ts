/**
 * @brika/auth - AuthHttpClient Tests
 *
 * Pure HTTP wrapper around fetch — exercise every method with a mocked fetch.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { realFetch } from '@brika/testing';
import { z } from 'zod';
import { Role } from '../roles';
import type { LoginResponse } from './AuthClient';
import { AuthHttpClient } from './http-client';

type FetchImpl = typeof fetch;

function makeFetchMock(): ReturnType<typeof mock<FetchImpl>> & { preconnect: () => void } {
  const fn = mock<FetchImpl>();
  return Object.assign(fn, { preconnect: () => {} });
}

const mockFetch = makeFetchMock();

beforeEach(() => {
  globalThis.fetch = mockFetch;
  mockFetch.mockReset();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchCallSchema = z.tuple([z.string(), z.record(z.string(), z.unknown())]);

function firstCall(): { url: string; init: Record<string, unknown> } {
  const call = mockFetch.mock.calls[0];
  const parsed = fetchCallSchema.parse(call);
  return { url: parsed[0], init: parsed[1] };
}

function readJsonBody(init: Record<string, unknown>): unknown {
  const body = init.body;
  if (typeof body !== 'string') {
    throw new TypeError('Expected request body to be a JSON string');
  }
  return JSON.parse(body);
}

const fakeLoginResponse: LoginResponse = {
  user: {
    id: 'user-1',
    email: 'me@x.com',
    name: 'Me',
    role: Role.USER,
    avatarHash: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
};

describe('AuthHttpClient', () => {
  describe('constructor', () => {
    it('strips a trailing slash from the baseUrl', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fakeLoginResponse));
      const client = new AuthHttpClient({ baseUrl: 'http://test/' });
      await client.login({ email: 'a@b.com', password: 'pw' });

      expect(firstCall().url).toBe('http://test/api/auth/login');
    });

    it('preserves a baseUrl with no trailing slash', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fakeLoginResponse));
      const client = new AuthHttpClient({ baseUrl: 'http://test' });
      await client.login({ email: 'a@b.com', password: 'pw' });

      expect(firstCall().url).toBe('http://test/api/auth/login');
    });

    it('accepts a custom fetch implementation', async () => {
      const custom = makeFetchMock();
      custom.mockResolvedValueOnce(jsonResponse(fakeLoginResponse));

      const client = new AuthHttpClient({ baseUrl: 'http://test', fetch: custom });
      await client.login({ email: 'a@b.com', password: 'pw' });
      expect(custom).toHaveBeenCalledTimes(1);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('POSTs JSON credentials with credentials: include', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(fakeLoginResponse));

      const client = new AuthHttpClient({ baseUrl: 'http://test' });
      const result = await client.login({ email: 'me@x.com', password: 'pw' });

      expect(result).toEqual(fakeLoginResponse);
      const { url, init } = firstCall();
      expect(url).toBe('http://test/api/auth/login');
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('include');
      expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(readJsonBody(init)).toEqual({ email: 'me@x.com', password: 'pw' });
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 401 }));

      const client = new AuthHttpClient({ baseUrl: 'http://test' });
      await expect(client.login({ email: 'x@x.com', password: 'pw' })).rejects.toThrow(
        'Login failed'
      );
    });
  });

  describe('logout', () => {
    it('POSTs to /api/auth/logout with credentials', async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

      const client = new AuthHttpClient({ baseUrl: 'http://test' });
      await client.logout();

      const { url, init } = firstCall();
      expect(url).toBe('http://test/api/auth/logout');
      expect(init.method).toBe('POST');
      expect(init.credentials).toBe('include');
    });
  });

  describe('verify', () => {
    it('returns true when the session endpoint responds OK', async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 200 }));

      const client = new AuthHttpClient({ baseUrl: 'http://test' });
      expect(await client.verify()).toBe(true);

      const { url, init } = firstCall();
      expect(url).toBe('http://test/api/auth/session');
      expect(init.credentials).toBe('include');
    });

    it('returns false when the session endpoint rejects the cookie', async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 401 }));

      const client = new AuthHttpClient({ baseUrl: 'http://test' });
      expect(await client.verify()).toBe(false);
    });
  });

  describe('request', () => {
    it('returns parsed JSON on success and forwards method/headers', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true, value: 42 }));

      const client = new AuthHttpClient({ baseUrl: 'http://test' });
      const result = await client.request<{ ok: boolean; value: number }>('/api/whatever', {
        method: 'PATCH',
        headers: { 'X-Trace': 'abc' },
      });

      expect(result).toEqual({ ok: true, value: 42 });
      const { url, init } = firstCall();
      expect(url).toBe('http://test/api/whatever');
      expect(init.method).toBe('PATCH');
      expect(init.headers).toEqual({ 'X-Trace': 'abc' });
      expect(init.credentials).toBe('include');
    });

    it('throws using statusText when the response is not ok', async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 404, statusText: 'Not Found' }));

      const client = new AuthHttpClient({ baseUrl: 'http://test' });
      await expect(client.request('/api/missing')).rejects.toThrow('Request failed: Not Found');
    });

    it('defaults options to empty object when none are passed', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      const client = new AuthHttpClient({ baseUrl: 'http://test' });
      await client.request('/api/default');

      const { init } = firstCall();
      expect(init.credentials).toBe('include');
      expect(init.method).toBeUndefined();
    });
  });
});
