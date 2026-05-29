/**
 * @brika/auth - AuthClient setup/getAuthClient Tests
 *
 * Covers the methods that the broader AuthClient.test.ts doesn't yet
 * exercise: `checkSetupStatus`, `completeSetup`, `setup`, and the
 * module-level `getAuthClient` singleton.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { realFetch } from '@brika/testing';
import { z } from 'zod';
import { AuthClient, getAuthClient } from './client/AuthClient';

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

const mockUser = {
  id: 'user-1',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin',
  avatarHash: null,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

describe('AuthClient.checkSetupStatus', () => {
  it('returns the server payload when the endpoint responds', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ hasAdmin: true, setupCompleted: false, needsSetup: true })
    );

    const client = new AuthClient({ apiUrl: 'http://test' });
    const status = await client.checkSetupStatus();

    expect(status).toEqual({ hasAdmin: true, setupCompleted: false, needsSetup: true });
    const { url, init } = firstCall();
    expect(url).toBe('http://test/api/setup/status');
    expect(init.credentials).toBe('include');
  });

  it('falls back to a safe default when the endpoint errors', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 500 }));

    const client = new AuthClient({ apiUrl: 'http://test' });
    const status = await client.checkSetupStatus();

    // Sentinel from AuthClient.ts when the request throws.
    expect(status).toEqual({ hasAdmin: false, setupCompleted: true, needsSetup: false });
  });

  it('falls back to the safe default when fetch itself rejects', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network down'));

    const client = new AuthClient({ apiUrl: 'http://test' });
    const status = await client.checkSetupStatus();
    expect(status).toEqual({ hasAdmin: false, setupCompleted: true, needsSetup: false });
  });
});

describe('AuthClient.completeSetup', () => {
  it('POSTs to /api/setup/complete', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    const client = new AuthClient({ apiUrl: 'http://test' });
    await client.completeSetup();

    const { url, init } = firstCall();
    expect(url).toBe('http://test/api/setup/complete');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
  });

  it('throws if the completion endpoint fails', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'nope' }, 400));

    const client = new AuthClient({ apiUrl: 'http://test' });
    await expect(client.completeSetup()).rejects.toThrow('nope');
  });
});

describe('AuthClient.setup', () => {
  it('POSTs setup payload and then fetches the resulting session', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    mockFetch.mockResolvedValueOnce(jsonResponse({ user: mockUser, scopes: ['admin:*'] }));

    const client = new AuthClient({ apiUrl: 'http://test' });
    const session = await client.setup({
      email: 'admin@example.com',
      name: 'Admin',
      password: 'Secret!1',
    });

    expect(session.user).toEqual(mockUser);
    expect(session.scopes).toEqual(['admin:*']);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const { url, init } = firstCall();
    expect(url).toBe('http://test/api/auth/setup');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(readJsonBody(init)).toEqual({
      email: 'admin@example.com',
      name: 'Admin',
      password: 'Secret!1',
    });
  });

  it('throws when the follow-up session fetch returns null', async () => {
    // setup() succeeds, then getSession() returns null (401 response).
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 401 }));

    const client = new AuthClient({ apiUrl: 'http://test' });
    await expect(
      client.setup({ email: 'admin@example.com', name: 'A', password: 'pw' })
    ).rejects.toThrow('Setup failed');
  });

  it('throws when the setup endpoint itself rejects the payload', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Weak password' }, 422));

    const client = new AuthClient({ apiUrl: 'http://test' });
    await expect(
      client.setup({ email: 'admin@example.com', name: 'A', password: 'short' })
    ).rejects.toThrow('Weak password');
  });
});

describe('getAuthClient', () => {
  it('returns the same instance across calls', () => {
    // getAuthClient lazily creates a module-level singleton. We can't reset
    // the module state from here, but we can at least pin that the same
    // reference comes back twice in a row.
    const a = getAuthClient({ apiUrl: 'http://singleton' });
    const b = getAuthClient({ apiUrl: 'http://different' });
    expect(b).toBe(a);
    expect(a).toBeInstanceOf(AuthClient);
  });
});
