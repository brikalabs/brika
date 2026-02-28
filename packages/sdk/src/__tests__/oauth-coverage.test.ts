/**
 * Extended coverage tests for SDK OAuth API
 *
 * Covers internal logic paths NOT exercised by the existing api-oauth.test.ts:
 * - PKCE helpers (generateCodeVerifier, generateCodeChallenge, base64url)
 * - parseTokenResponse error paths and defaults
 * - isOAuthToken type guard edge cases
 * - getStringPreference utility
 * - Token refresh logic and 60s expiration buffer
 * - Callback route error cases (missing code, error param, invalid state)
 * - Authenticated fetch with expired token auto-refresh
 * - Non-PKCE (Basic auth) flow
 * - getRedirectUri host normalization
 * - getClientId / getClientSecret from preferences and error cases
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { OAuthClient, OAuthProviderConfig } from '../api/oauth';

// ─── Mock Setup ─────────────────────────────────────────────────────────────────

const preferences: Record<string, unknown> = {};
const registeredRoutes: Array<{ method: string; path: string; handler: Function }> = [];

const mockGetPreferences = mock(() => preferences);
const mockUpdatePreference = mock((key: string, value: unknown) => {
  preferences[key] = value;
});
const mockRegisterRoute = mock((method: string, path: string, handler: Function) => {
  registeredRoutes.push({ method, path, handler });
});
const mockLog = mock(() => {});

mock.module('../context', () => ({
  getContext: () => ({
    getPreferences: mockGetPreferences,
    updatePreference: mockUpdatePreference,
    registerRoute: mockRegisterRoute,
    log: mockLog,
  }),
}));

const { defineOAuth } = await import('../api/oauth');

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Counter to generate unique provider IDs so route registrations don't clash. */
let providerCounter = 0;

function uniqueId(prefix = 'cov'): string {
  return `${prefix}-${++providerCounter}`;
}

function createConfig(overrides?: Partial<OAuthProviderConfig>): OAuthProviderConfig {
  return {
    id: uniqueId(),
    authorizeUrl: 'https://auth.example.com/authorize',
    tokenUrl: 'https://auth.example.com/token',
    scopes: ['read', 'write'],
    clientId: 'test-client-id',
    ...overrides,
  };
}

function findRoute(method: string, pathFragment: string) {
  return registeredRoutes.find((r) => r.method === method && r.path.includes(pathFragment));
}

function makeReq(
  overrides: Partial<{
    method: string;
    path: string;
    query: Record<string, string>;
    headers: Record<string, string>;
    body: unknown;
  }> = {}
) {
  return {
    method: overrides.method ?? 'GET',
    path: overrides.path ?? '/',
    query: overrides.query ?? {},
    headers: overrides.headers ?? { host: '127.0.0.1:3001' },
    body: overrides.body,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('OAuth coverage: authorize route + PKCE', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    for (const key of Object.keys(preferences)) delete preferences[key];
    registeredRoutes.length = 0;
    mockGetPreferences.mockClear();
    mockUpdatePreference.mockClear();
    mockRegisterRoute.mockClear();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('authorize route returns 302 redirect with PKCE params', async () => {
    const id = uniqueId('pkce');
    defineOAuth(createConfig({ id, scopes: ['user-read-playback-state'] }));

    const authorizeRoute = findRoute('GET', `/oauth/${id}/authorize`);
    expect(authorizeRoute).toBeDefined();

    const result = await authorizeRoute!.handler(makeReq());

    expect(result.status).toBe(302);
    expect(result.headers.Location).toBeDefined();

    const location = new URL(result.headers.Location);
    expect(location.origin).toBe('https://auth.example.com');
    expect(location.pathname).toBe('/authorize');
    expect(location.searchParams.get('response_type')).toBe('code');
    expect(location.searchParams.get('client_id')).toBe('test-client-id');
    expect(location.searchParams.get('scope')).toBe('user-read-playback-state');
    // PKCE params must be present
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('code_challenge')).toBeTruthy();
    expect(location.searchParams.get('state')).toBeTruthy();
  });

  test('authorize route redirect_uri normalizes localhost to 127.0.0.1', async () => {
    const id = uniqueId('host');
    defineOAuth(createConfig({ id }));

    const authorizeRoute = findRoute('GET', `/oauth/${id}/authorize`);
    const result = await authorizeRoute!.handler(makeReq({ headers: { host: 'localhost:3001' } }));

    const location = new URL(result.headers.Location);
    const redirectUri = location.searchParams.get('redirect_uri');
    expect(redirectUri).toContain('127.0.0.1:3001');
    expect(redirectUri).not.toContain('localhost');
  });

  test('authorize route redirect_uri normalizes 0.0.0.0 to 127.0.0.1', async () => {
    const id = uniqueId('zero');
    defineOAuth(createConfig({ id }));

    const authorizeRoute = findRoute('GET', `/oauth/${id}/authorize`);
    const result = await authorizeRoute!.handler(makeReq({ headers: { host: '0.0.0.0:3001' } }));

    const location = new URL(result.headers.Location);
    const redirectUri = location.searchParams.get('redirect_uri');
    expect(redirectUri).toContain('127.0.0.1:3001');
  });

  test('authorize route uses x-forwarded-proto for redirect_uri', async () => {
    const id = uniqueId('proto');
    defineOAuth(createConfig({ id }));

    const authorizeRoute = findRoute('GET', `/oauth/${id}/authorize`);
    const result = await authorizeRoute!.handler(
      makeReq({ headers: { host: 'app.example.com', 'x-forwarded-proto': 'https' } })
    );

    const location = new URL(result.headers.Location);
    const redirectUri = location.searchParams.get('redirect_uri');
    expect(redirectUri).toStartWith('https://app.example.com/api/oauth/');
  });

  test('authorize route defaults host to 127.0.0.1:3001 when missing', async () => {
    const id = uniqueId('nohost');
    defineOAuth(createConfig({ id }));

    const authorizeRoute = findRoute('GET', `/oauth/${id}/authorize`);
    const result = await authorizeRoute!.handler(makeReq({ headers: {} }));

    const location = new URL(result.headers.Location);
    const redirectUri = location.searchParams.get('redirect_uri');
    expect(redirectUri).toContain('127.0.0.1:3001');
  });

  test('PKCE code_challenge is valid base64url (no +, /, or trailing =)', async () => {
    const id = uniqueId('b64');
    defineOAuth(createConfig({ id }));

    const authorizeRoute = findRoute('GET', `/oauth/${id}/authorize`);
    const result = await authorizeRoute!.handler(makeReq());

    const location = new URL(result.headers.Location);
    const challenge = location.searchParams.get('code_challenge') ?? '';
    expect(challenge.length).toBeGreaterThan(0);
    // base64url must not contain +, /, or trailing =
    expect(challenge).not.toContain('+');
    expect(challenge).not.toContain('/');
    expect(challenge).not.toMatch(/=$/);
  });
});

describe('OAuth coverage: authorize route non-PKCE', () => {
  beforeEach(() => {
    for (const key of Object.keys(preferences)) delete preferences[key];
    registeredRoutes.length = 0;
  });

  test('authorize route omits PKCE params when pkce: false', async () => {
    const id = uniqueId('nopkce');
    defineOAuth(
      createConfig({
        id,
        pkce: false,
        clientSecret: 'my-secret',
      })
    );

    const authorizeRoute = findRoute('GET', `/oauth/${id}/authorize`);
    const result = await authorizeRoute!.handler(makeReq());

    expect(result.status).toBe(302);
    const location = new URL(result.headers.Location);
    expect(location.searchParams.get('code_challenge_method')).toBeNull();
    expect(location.searchParams.get('code_challenge')).toBeNull();
    // Still has state
    expect(location.searchParams.get('state')).toBeTruthy();
  });
});

describe('OAuth coverage: callback route error cases', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    for (const key of Object.keys(preferences)) delete preferences[key];
    registeredRoutes.length = 0;
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('callback returns error HTML when error query param is present', async () => {
    const id = uniqueId('err');
    defineOAuth(createConfig({ id }));

    const callbackRoute = findRoute('GET', `/oauth/${id}/callback`);
    const result = await callbackRoute!.handler(makeReq({ query: { error: 'access_denied' } }));

    expect(result.status).toBe(200);
    expect(result.headers['Content-Type']).toBe('text/html');
    expect(result.body).toContain('Authorization failed');
    expect(result.body).toContain('access_denied');
  });

  test('callback returns 400 when code is missing', async () => {
    const id = uniqueId('nocode');
    defineOAuth(createConfig({ id }));

    const callbackRoute = findRoute('GET', `/oauth/${id}/callback`);
    const result = await callbackRoute!.handler(makeReq({ query: {} }));

    expect(result.status).toBe(400);
    expect(result.body).toContain('Missing authorization code');
  });

  test('callback returns 400 when PKCE verifier is not found (invalid state)', async () => {
    const id = uniqueId('badstate');
    defineOAuth(createConfig({ id }));

    const callbackRoute = findRoute('GET', `/oauth/${id}/callback`);
    // Provide code but with a state that was never registered
    const result = await callbackRoute!.handler(
      makeReq({ query: { code: 'auth-code', state: 'nonexistent-state' } })
    );

    expect(result.status).toBe(400);
    expect(result.body).toContain('PKCE verifier not found');
  });

  test('callback returns 400 when PKCE and state is missing', async () => {
    const id = uniqueId('nostate');
    defineOAuth(createConfig({ id }));

    const callbackRoute = findRoute('GET', `/oauth/${id}/callback`);
    // Provide code but no state — PKCE verifier lookup fails
    const result = await callbackRoute!.handler(makeReq({ query: { code: 'auth-code' } }));

    expect(result.status).toBe(400);
    expect(result.body).toContain('PKCE verifier not found');
  });

  test('callback handles token exchange HTTP failure', async () => {
    const id = uniqueId('tokfail');
    defineOAuth(createConfig({ id, pkce: false, clientSecret: 'secret' }));

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Bad Request', { status: 400 }))
    ) as typeof fetch;

    const callbackRoute = findRoute('GET', `/oauth/${id}/callback`);
    const result = await callbackRoute!.handler(
      makeReq({ query: { code: 'auth-code', state: 'some-state' } })
    );

    expect(result.status).toBe(200);
    expect(result.body).toContain('Token exchange failed');
    expect(result.body).toContain('Bad Request');
  });

  test('callback handles invalid token response (parseTokenResponse returns null)', async () => {
    const id = uniqueId('badtok');
    defineOAuth(createConfig({ id, pkce: false, clientSecret: 'secret' }));

    // Return a 200 but with no access_token in the JSON
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    ) as typeof fetch;

    const callbackRoute = findRoute('GET', `/oauth/${id}/callback`);
    const result = await callbackRoute!.handler(
      makeReq({ query: { code: 'auth-code', state: 'some-state' } })
    );

    expect(result.status).toBe(200);
    expect(result.body).toContain('Invalid token response');
  });

  test('callback handles fetch/network exception with 500', async () => {
    const id = uniqueId('netfail');
    defineOAuth(createConfig({ id, pkce: false, clientSecret: 'secret' }));

    globalThis.fetch = mock(() => Promise.reject(new Error('Network error'))) as typeof fetch;

    const callbackRoute = findRoute('GET', `/oauth/${id}/callback`);
    const result = await callbackRoute!.handler(
      makeReq({ query: { code: 'auth-code', state: 'some-state' } })
    );

    expect(result.status).toBe(500);
    expect(result.body).toContain('Network error');
  });

  test('callback exchanges code for token successfully (non-PKCE)', async () => {
    const id = uniqueId('success');
    defineOAuth(createConfig({ id, pkce: false, clientSecret: 'my-secret' }));

    const tokenResponse = {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
    };

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(tokenResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    ) as typeof fetch;

    const callbackRoute = findRoute('GET', `/oauth/${id}/callback`);
    const result = await callbackRoute!.handler(
      makeReq({ query: { code: 'auth-code', state: 'some-state' } })
    );

    expect(result.status).toBe(200);
    expect(result.body).toContain('Connected!');
    // Token should be stored in preferences
    expect(mockUpdatePreference).toHaveBeenCalled();
    const storedToken = preferences[`__oauth_${id}_token`] as Record<string, unknown>;
    expect(storedToken.access_token).toBe('new-access-token');
    expect(storedToken.refresh_token).toBe('new-refresh-token');
    expect(storedToken.token_type).toBe('Bearer');
    expect(typeof storedToken.expires_at).toBe('number');
  });

  test('callback sends Basic auth header for non-PKCE flow', async () => {
    const id = uniqueId('basic');
    defineOAuth(
      createConfig({
        id,
        pkce: false,
        clientId: 'my-client',
        clientSecret: 'my-secret',
      })
    );

    let capturedHeaders: Headers | undefined;
    globalThis.fetch = mock((url: string, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return Promise.resolve(
        new Response(
          JSON.stringify({ access_token: 'tok', expires_in: 3600, token_type: 'Bearer' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }) as typeof fetch;

    const callbackRoute = findRoute('GET', `/oauth/${id}/callback`);
    await callbackRoute!.handler(makeReq({ query: { code: 'auth-code', state: 'state' } }));

    expect(capturedHeaders).toBeDefined();
    const authHeader = capturedHeaders!.get('Authorization');
    expect(authHeader).toStartWith('Basic ');
    // Decode and verify credentials
    const decoded = atob(authHeader!.replace('Basic ', ''));
    expect(decoded).toBe('my-client:my-secret');
  });

  test('callback does NOT send Basic auth header for PKCE flow', async () => {
    const id = uniqueId('pkcecb');
    const client = defineOAuth(createConfig({ id, pkce: true }));

    // First call authorize to register a PKCE verifier
    const authorizeRoute = findRoute('GET', `/oauth/${id}/authorize`);
    const authResult = await authorizeRoute!.handler(makeReq());
    const location = new URL(authResult.headers.Location);
    const state = location.searchParams.get('state')!;

    let capturedHeaders: Headers | undefined;
    globalThis.fetch = mock((url: string, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return Promise.resolve(
        new Response(
          JSON.stringify({ access_token: 'tok', expires_in: 3600, token_type: 'Bearer' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }) as typeof fetch;

    const callbackRoute = findRoute('GET', `/oauth/${id}/callback`);
    await callbackRoute!.handler(makeReq({ query: { code: 'auth-code', state } }));

    expect(capturedHeaders).toBeDefined();
    expect(capturedHeaders!.get('Authorization')).toBeNull();
    expect(capturedHeaders!.get('Content-Type')).toBe('application/x-www-form-urlencoded');
  });
});

describe('OAuth coverage: PKCE full authorize + callback flow', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    for (const key of Object.keys(preferences)) delete preferences[key];
    registeredRoutes.length = 0;
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('PKCE flow: authorize sets verifier, callback sends code_verifier', async () => {
    const id = uniqueId('pkceflow');
    defineOAuth(createConfig({ id }));

    // Step 1: authorize to generate and store PKCE verifier
    const authorizeRoute = findRoute('GET', `/oauth/${id}/authorize`);
    const authResult = await authorizeRoute!.handler(makeReq());
    const location = new URL(authResult.headers.Location);
    const state = location.searchParams.get('state')!;

    let capturedBody: URLSearchParams | undefined;
    globalThis.fetch = mock((url: string, init?: RequestInit) => {
      capturedBody = new URLSearchParams(init?.body as string);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: 'pkce-token',
            refresh_token: 'pkce-refresh',
            expires_in: 7200,
            token_type: 'Bearer',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }) as typeof fetch;

    // Step 2: callback with correct state
    const callbackRoute = findRoute('GET', `/oauth/${id}/callback`);
    const result = await callbackRoute!.handler(
      makeReq({ query: { code: 'pkce-auth-code', state } })
    );

    expect(result.status).toBe(200);
    expect(result.body).toContain('Connected!');

    // Verify code_verifier was sent in body
    expect(capturedBody).toBeDefined();
    expect(capturedBody!.get('code_verifier')).toBeTruthy();
    expect(capturedBody!.get('grant_type')).toBe('authorization_code');
    expect(capturedBody!.get('code')).toBe('pkce-auth-code');
    expect(capturedBody!.get('client_id')).toBe('test-client-id');

    // Verify token was stored
    const storedToken = preferences[`__oauth_${id}_token`] as Record<string, unknown>;
    expect(storedToken.access_token).toBe('pkce-token');
  });

  test('PKCE verifier is removed after successful callback (cannot reuse)', async () => {
    const id = uniqueId('verifierclean');
    defineOAuth(createConfig({ id }));

    // Authorize to get state
    const authorizeRoute = findRoute('GET', `/oauth/${id}/authorize`);
    const authResult = await authorizeRoute!.handler(makeReq());
    const location = new URL(authResult.headers.Location);
    const state = location.searchParams.get('state')!;

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ access_token: 'tok', expires_in: 3600, token_type: 'Bearer' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    ) as typeof fetch;

    const callbackRoute = findRoute('GET', `/oauth/${id}/callback`);

    // First callback should succeed
    const result1 = await callbackRoute!.handler(makeReq({ query: { code: 'code1', state } }));
    expect(result1.status).toBe(200);
    expect(result1.body).toContain('Connected!');

    // Second callback with same state should fail (verifier already consumed)
    const result2 = await callbackRoute!.handler(makeReq({ query: { code: 'code2', state } }));
    expect(result2.status).toBe(400);
    expect(result2.body).toContain('PKCE verifier not found');
  });
});

describe('OAuth coverage: parseTokenResponse edge cases (via callback)', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    for (const key of Object.keys(preferences)) delete preferences[key];
    registeredRoutes.length = 0;
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('token response without expires_in defaults to 3600s', async () => {
    const id = uniqueId('noexpiry');
    defineOAuth(createConfig({ id, pkce: false, clientSecret: 'secret' }));

    const before = Date.now();
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ access_token: 'tok', token_type: 'Bearer' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    ) as typeof fetch;

    const callbackRoute = findRoute('GET', `/oauth/${id}/callback`);
    await callbackRoute!.handler(makeReq({ query: { code: 'code', state: 'state' } }));

    const storedToken = preferences[`__oauth_${id}_token`] as Record<string, unknown>;
    const expiresAt = storedToken.expires_at as number;
    // Default 3600s = 3_600_000ms from now
    expect(expiresAt).toBeGreaterThanOrEqual(before + 3_600_000 - 100);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 3_600_000 + 100);
  });

  test('token response without token_type defaults to Bearer', async () => {
    const id = uniqueId('notype');
    defineOAuth(createConfig({ id, pkce: false, clientSecret: 'secret' }));

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ access_token: 'tok', expires_in: 1000 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    ) as typeof fetch;

    const callbackRoute = findRoute('GET', `/oauth/${id}/callback`);
    await callbackRoute!.handler(makeReq({ query: { code: 'code', state: 'state' } }));

    const storedToken = preferences[`__oauth_${id}_token`] as Record<string, unknown>;
    expect(storedToken.token_type).toBe('Bearer');
  });

  test('token response without refresh_token stores undefined', async () => {
    const id = uniqueId('norefresh');
    defineOAuth(createConfig({ id, pkce: false, clientSecret: 'secret' }));

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ access_token: 'tok', expires_in: 3600, token_type: 'Bearer' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    ) as typeof fetch;

    const callbackRoute = findRoute('GET', `/oauth/${id}/callback`);
    await callbackRoute!.handler(makeReq({ query: { code: 'code', state: 'state' } }));

    const storedToken = preferences[`__oauth_${id}_token`] as Record<string, unknown>;
    expect(storedToken.refresh_token).toBeUndefined();
  });

  test('null json body causes "Invalid token response"', async () => {
    const id = uniqueId('nulljson');
    defineOAuth(createConfig({ id, pkce: false, clientSecret: 'secret' }));

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response('null', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    ) as typeof fetch;

    const callbackRoute = findRoute('GET', `/oauth/${id}/callback`);
    const result = await callbackRoute!.handler(
      makeReq({ query: { code: 'code', state: 'state' } })
    );

    expect(result.body).toContain('Invalid token response');
  });

  test('non-string access_token causes "Invalid token response"', async () => {
    const id = uniqueId('numtok');
    defineOAuth(createConfig({ id, pkce: false, clientSecret: 'secret' }));

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ access_token: 12345, expires_in: 3600 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    ) as typeof fetch;

    const callbackRoute = findRoute('GET', `/oauth/${id}/callback`);
    const result = await callbackRoute!.handler(
      makeReq({ query: { code: 'code', state: 'state' } })
    );

    expect(result.body).toContain('Invalid token response');
  });
});

describe('OAuth coverage: isOAuthToken via getToken', () => {
  beforeEach(() => {
    for (const key of Object.keys(preferences)) delete preferences[key];
    registeredRoutes.length = 0;
  });

  test('getToken returns null for null stored value', () => {
    const id = uniqueId('nullval');
    const client = defineOAuth(createConfig({ id }));
    preferences[`__oauth_${id}_token`] = null;
    expect(client.getToken()).toBeNull();
  });

  test('getToken returns null for string stored value', () => {
    const id = uniqueId('strval');
    const client = defineOAuth(createConfig({ id }));
    preferences[`__oauth_${id}_token`] = 'not-an-object';
    expect(client.getToken()).toBeNull();
  });

  test('getToken returns null for number stored value', () => {
    const id = uniqueId('numval');
    const client = defineOAuth(createConfig({ id }));
    preferences[`__oauth_${id}_token`] = 42;
    expect(client.getToken()).toBeNull();
  });

  test('getToken returns null when access_token is missing', () => {
    const id = uniqueId('noat');
    const client = defineOAuth(createConfig({ id }));
    preferences[`__oauth_${id}_token`] = { expires_at: Date.now() + 3600000 };
    expect(client.getToken()).toBeNull();
  });

  test('getToken returns null when expires_at is missing', () => {
    const id = uniqueId('noexp');
    const client = defineOAuth(createConfig({ id }));
    preferences[`__oauth_${id}_token`] = { access_token: 'tok' };
    expect(client.getToken()).toBeNull();
  });

  test('getToken returns null when expires_at is not a number', () => {
    const id = uniqueId('strexp');
    const client = defineOAuth(createConfig({ id }));
    preferences[`__oauth_${id}_token`] = { access_token: 'tok', expires_at: 'not-a-number' };
    expect(client.getToken()).toBeNull();
  });

  test('getToken returns valid token with all fields', () => {
    const id = uniqueId('full');
    const client = defineOAuth(createConfig({ id }));
    const expiresAt = Date.now() + 3600000;
    preferences[`__oauth_${id}_token`] = {
      access_token: 'my-token',
      refresh_token: 'my-refresh',
      expires_at: expiresAt,
      token_type: 'Bearer',
    };
    const token = client.getToken();
    expect(token).not.toBeNull();
    expect(token!.access_token).toBe('my-token');
    expect(token!.refresh_token).toBe('my-refresh');
    expect(token!.expires_at).toBe(expiresAt);
  });
});

describe('OAuth coverage: getStringPreference + getClientId/getClientSecret', () => {
  beforeEach(() => {
    for (const key of Object.keys(preferences)) delete preferences[key];
    registeredRoutes.length = 0;
  });

  test('clientIdPreference reads client ID from preferences', async () => {
    const id = uniqueId('prefid');
    preferences['myClientIdPref'] = 'pref-client-id';
    defineOAuth(
      createConfig({
        id,
        clientId: undefined,
        clientIdPreference: 'myClientIdPref',
      })
    );

    const authorizeRoute = findRoute('GET', `/oauth/${id}/authorize`);
    const result = await authorizeRoute!.handler(makeReq());

    const location = new URL(result.headers.Location);
    expect(location.searchParams.get('client_id')).toBe('pref-client-id');
  });

  test('hardcoded clientId takes priority over clientIdPreference', async () => {
    const id = uniqueId('prioid');
    preferences['myClientIdPref'] = 'pref-value';
    defineOAuth(
      createConfig({
        id,
        clientId: 'hardcoded-value',
        clientIdPreference: 'myClientIdPref',
      })
    );

    const authorizeRoute = findRoute('GET', `/oauth/${id}/authorize`);
    const result = await authorizeRoute!.handler(makeReq());

    const location = new URL(result.headers.Location);
    expect(location.searchParams.get('client_id')).toBe('hardcoded-value');
  });

  test('throws when no clientId and no clientIdPreference value', async () => {
    const id = uniqueId('noid');
    defineOAuth(
      createConfig({
        id,
        clientId: undefined,
        clientIdPreference: undefined,
      })
    );

    const authorizeRoute = findRoute('GET', `/oauth/${id}/authorize`);
    // getClientId throws, which is caught by the route try/catch in callback
    // but for the authorize route it's not in try/catch, so it throws directly
    await expect(authorizeRoute!.handler(makeReq())).rejects.toThrow('Missing client ID');
  });

  test('throws when clientIdPreference key exists but value is not a string', async () => {
    const id = uniqueId('nonstr');
    preferences['numPref'] = 42;
    defineOAuth(
      createConfig({
        id,
        clientId: undefined,
        clientIdPreference: 'numPref',
      })
    );

    const authorizeRoute = findRoute('GET', `/oauth/${id}/authorize`);
    await expect(authorizeRoute!.handler(makeReq())).rejects.toThrow('Missing client ID');
  });

  test('clientSecretPreference reads secret from preferences (non-PKCE)', async () => {
    const id = uniqueId('prefsecret');
    preferences['mySecretPref'] = 'pref-secret';
    defineOAuth(
      createConfig({
        id,
        pkce: false,
        clientSecret: undefined,
        clientSecretPreference: 'mySecretPref',
      })
    );

    let capturedHeaders: Headers | undefined;
    globalThis.fetch = mock((url: string, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return Promise.resolve(
        new Response(
          JSON.stringify({ access_token: 'tok', expires_in: 3600, token_type: 'Bearer' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    }) as typeof fetch;

    const callbackRoute = findRoute('GET', `/oauth/${id}/callback`);
    await callbackRoute!.handler(makeReq({ query: { code: 'code', state: 'state' } }));

    const authHeader = capturedHeaders!.get('Authorization')!;
    const decoded = atob(authHeader.replace('Basic ', ''));
    expect(decoded).toBe('test-client-id:pref-secret');

    // Restore fetch
    globalThis.fetch = globalThis.fetch;
  });

  test('throws when no clientSecret and no clientSecretPreference value (non-PKCE callback)', async () => {
    const id = uniqueId('nosecret');
    defineOAuth(
      createConfig({
        id,
        pkce: false,
        clientSecret: undefined,
        clientSecretPreference: undefined,
      })
    );

    const callbackRoute = findRoute('GET', `/oauth/${id}/callback`);
    const result = await callbackRoute!.handler(
      makeReq({ query: { code: 'code', state: 'state' } })
    );

    // The error is caught by the try/catch in the callback handler
    expect(result.status).toBe(500);
    expect(result.body).toContain('Missing client secret');
  });
});

describe('OAuth coverage: authenticated fetch', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    for (const key of Object.keys(preferences)) delete preferences[key];
    registeredRoutes.length = 0;
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('fetch sets Authorization header with token_type and access_token', async () => {
    const id = uniqueId('authfetch');
    const client = defineOAuth(createConfig({ id }));

    preferences[`__oauth_${id}_token`] = {
      access_token: 'my-access-token',
      expires_at: Date.now() + 3600000,
      token_type: 'Bearer',
    };

    let capturedHeaders: Headers | undefined;
    globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return Promise.resolve(new Response('ok'));
    }) as typeof fetch;

    await client.fetch('https://api.example.com/data');

    expect(capturedHeaders).toBeDefined();
    expect(capturedHeaders!.get('Authorization')).toBe('Bearer my-access-token');
  });

  test('fetch uses custom token_type in Authorization header', async () => {
    const id = uniqueId('customtype');
    const client = defineOAuth(createConfig({ id }));

    preferences[`__oauth_${id}_token`] = {
      access_token: 'mac-token',
      expires_at: Date.now() + 3600000,
      token_type: 'MAC',
    };

    let capturedHeaders: Headers | undefined;
    globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return Promise.resolve(new Response('ok'));
    }) as typeof fetch;

    await client.fetch('https://api.example.com/data');
    expect(capturedHeaders!.get('Authorization')).toBe('MAC mac-token');
  });

  test('fetch passes through custom init options', async () => {
    const id = uniqueId('passinit');
    const client = defineOAuth(createConfig({ id }));

    preferences[`__oauth_${id}_token`] = {
      access_token: 'tok',
      expires_at: Date.now() + 3600000,
      token_type: 'Bearer',
    };

    let capturedInit: RequestInit | undefined;
    globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
      capturedInit = init;
      return Promise.resolve(new Response('ok'));
    }) as typeof fetch;

    await client.fetch('https://api.example.com/data', {
      method: 'POST',
      body: JSON.stringify({ key: 'value' }),
      headers: { 'X-Custom': 'header' },
    });

    // The method and body should be passed through
    expect(capturedInit!.method).toBe('POST');
    expect(capturedInit!.body).toBe(JSON.stringify({ key: 'value' }));
    // Authorization header should be added alongside the custom header
    const headers = new Headers(capturedInit!.headers);
    expect(headers.get('Authorization')).toBe('Bearer tok');
    expect(headers.get('X-Custom')).toBe('header');
  });

  test('fetch auto-refreshes token when expired within 60s buffer', async () => {
    const id = uniqueId('autorefresh');
    const client = defineOAuth(createConfig({ id }));

    // Token expires in 30s — within the 60s buffer
    preferences[`__oauth_${id}_token`] = {
      access_token: 'old-token',
      refresh_token: 'my-refresh-token',
      expires_at: Date.now() + 30_000,
      token_type: 'Bearer',
    };

    let fetchCallCount = 0;
    globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        // First call is the refresh token request
        expect(String(url)).toBe('https://auth.example.com/token');
        return Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: 'refreshed-token',
              expires_in: 3600,
              token_type: 'Bearer',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }
      // Second call is the actual API request
      return Promise.resolve(new Response('ok'));
    }) as typeof fetch;

    const response = await client.fetch('https://api.example.com/data');
    expect(response).toBeDefined();
    expect(fetchCallCount).toBe(2);

    // The refreshed token should be stored
    const storedToken = preferences[`__oauth_${id}_token`] as Record<string, unknown>;
    expect(storedToken.access_token).toBe('refreshed-token');
  });

  test('fetch auto-refreshes token that is already expired', async () => {
    const id = uniqueId('expired');
    const client = defineOAuth(createConfig({ id }));

    // Token expired 10 minutes ago
    preferences[`__oauth_${id}_token`] = {
      access_token: 'expired-token',
      refresh_token: 'my-refresh-token',
      expires_at: Date.now() - 600_000,
      token_type: 'Bearer',
    };

    let fetchCallCount = 0;
    globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: 'new-token',
              refresh_token: 'new-refresh',
              expires_in: 7200,
              token_type: 'Bearer',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }
      return Promise.resolve(new Response('ok'));
    }) as typeof fetch;

    await client.fetch('https://api.example.com/data');
    expect(fetchCallCount).toBe(2);
  });

  test('fetch throws when token is expired and no refresh_token', async () => {
    const id = uniqueId('norefreshexp');
    const client = defineOAuth(createConfig({ id }));

    preferences[`__oauth_${id}_token`] = {
      access_token: 'expired-token',
      expires_at: Date.now() - 600_000,
      token_type: 'Bearer',
    };

    await expect(client.fetch('https://api.example.com/data')).rejects.toThrow(
      'Token expired and refresh failed'
    );
  });

  test('fetch throws when token is expired and refresh HTTP request fails', async () => {
    const id = uniqueId('refreshfail');
    const client = defineOAuth(createConfig({ id }));

    preferences[`__oauth_${id}_token`] = {
      access_token: 'expired-token',
      refresh_token: 'bad-refresh',
      expires_at: Date.now() - 600_000,
      token_type: 'Bearer',
    };

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Unauthorized', { status: 401 }))
    ) as typeof fetch;

    await expect(client.fetch('https://api.example.com/data')).rejects.toThrow(
      'Token expired and refresh failed'
    );
  });

  test('fetch throws when token is expired and refresh returns invalid token', async () => {
    const id = uniqueId('refreshbad');
    const client = defineOAuth(createConfig({ id }));

    preferences[`__oauth_${id}_token`] = {
      access_token: 'expired-token',
      refresh_token: 'some-refresh',
      expires_at: Date.now() - 600_000,
      token_type: 'Bearer',
    };

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    ) as typeof fetch;

    await expect(client.fetch('https://api.example.com/data')).rejects.toThrow(
      'Token expired and refresh failed'
    );
  });

  test('fetch throws when token is expired and refresh throws network error', async () => {
    const id = uniqueId('refreshnet');
    const client = defineOAuth(createConfig({ id }));

    preferences[`__oauth_${id}_token`] = {
      access_token: 'expired-token',
      refresh_token: 'some-refresh',
      expires_at: Date.now() - 600_000,
      token_type: 'Bearer',
    };

    globalThis.fetch = mock(() =>
      Promise.reject(new Error('DNS resolution failed'))
    ) as typeof fetch;

    await expect(client.fetch('https://api.example.com/data')).rejects.toThrow(
      'Token expired and refresh failed'
    );
  });

  test('fetch does NOT refresh when token is valid (more than 60s remaining)', async () => {
    const id = uniqueId('norefresh2');
    const client = defineOAuth(createConfig({ id }));

    preferences[`__oauth_${id}_token`] = {
      access_token: 'valid-token',
      refresh_token: 'some-refresh',
      expires_at: Date.now() + 300_000, // 5 minutes remaining
      token_type: 'Bearer',
    };

    let fetchCallCount = 0;
    globalThis.fetch = mock(() => {
      fetchCallCount++;
      return Promise.resolve(new Response('ok'));
    }) as typeof fetch;

    await client.fetch('https://api.example.com/data');
    // Only one fetch: the actual API call (no refresh)
    expect(fetchCallCount).toBe(1);
  });

  test('refresh preserves existing refresh_token when new response omits it', async () => {
    const id = uniqueId('preserverefresh');
    const client = defineOAuth(createConfig({ id }));

    preferences[`__oauth_${id}_token`] = {
      access_token: 'old-token',
      refresh_token: 'original-refresh-token',
      expires_at: Date.now() + 30_000, // within 60s buffer
      token_type: 'Bearer',
    };

    let fetchCallCount = 0;
    globalThis.fetch = mock((url: string | URL | Request) => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        // Refresh response with NO refresh_token
        return Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: 'new-token',
              expires_in: 3600,
              token_type: 'Bearer',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }
      return Promise.resolve(new Response('ok'));
    }) as typeof fetch;

    await client.fetch('https://api.example.com/data');

    // The stored token should keep the original refresh_token
    const storedToken = preferences[`__oauth_${id}_token`] as Record<string, unknown>;
    expect(storedToken.access_token).toBe('new-token');
    expect(storedToken.refresh_token).toBe('original-refresh-token');
  });

  test('refreshed token uses new refresh_token when provided', async () => {
    const id = uniqueId('newrefresh');
    const client = defineOAuth(createConfig({ id }));

    preferences[`__oauth_${id}_token`] = {
      access_token: 'old-token',
      refresh_token: 'old-refresh',
      expires_at: Date.now() + 30_000,
      token_type: 'Bearer',
    };

    let fetchCallCount = 0;
    globalThis.fetch = mock((url: string | URL | Request) => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: 'new-token',
              refresh_token: 'new-refresh',
              expires_in: 3600,
              token_type: 'Bearer',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }
      return Promise.resolve(new Response('ok'));
    }) as typeof fetch;

    await client.fetch('https://api.example.com/data');

    const storedToken = preferences[`__oauth_${id}_token`] as Record<string, unknown>;
    expect(storedToken.refresh_token).toBe('new-refresh');
  });
});

describe('OAuth coverage: refresh sends correct body params', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    for (const key of Object.keys(preferences)) delete preferences[key];
    registeredRoutes.length = 0;
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('refresh sends grant_type=refresh_token with client_id', async () => {
    const id = uniqueId('refreshbody');
    const client = defineOAuth(createConfig({ id }));

    preferences[`__oauth_${id}_token`] = {
      access_token: 'old',
      refresh_token: 'rt',
      expires_at: Date.now() - 1000,
      token_type: 'Bearer',
    };

    let capturedBody: URLSearchParams | undefined;
    let fetchCallCount = 0;
    globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        capturedBody = new URLSearchParams(init?.body as string);
        return Promise.resolve(
          new Response(
            JSON.stringify({ access_token: 'new', expires_in: 3600, token_type: 'Bearer' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }
      return Promise.resolve(new Response('ok'));
    }) as typeof fetch;

    await client.fetch('https://api.example.com/data');

    expect(capturedBody).toBeDefined();
    expect(capturedBody!.get('grant_type')).toBe('refresh_token');
    expect(capturedBody!.get('refresh_token')).toBe('rt');
    expect(capturedBody!.get('client_id')).toBe('test-client-id');
  });

  test('non-PKCE refresh sends Basic auth header', async () => {
    const id = uniqueId('refreshbasic');
    const client = defineOAuth(
      createConfig({
        id,
        pkce: false,
        clientSecret: 'the-secret',
      })
    );

    preferences[`__oauth_${id}_token`] = {
      access_token: 'old',
      refresh_token: 'rt',
      expires_at: Date.now() - 1000,
      token_type: 'Bearer',
    };

    let capturedHeaders: Headers | undefined;
    let fetchCallCount = 0;
    globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        capturedHeaders = new Headers(init?.headers);
        return Promise.resolve(
          new Response(
            JSON.stringify({ access_token: 'new', expires_in: 3600, token_type: 'Bearer' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }
      return Promise.resolve(new Response('ok'));
    }) as typeof fetch;

    await client.fetch('https://api.example.com/data');

    expect(capturedHeaders).toBeDefined();
    const authHeader = capturedHeaders!.get('Authorization')!;
    expect(authHeader).toStartWith('Basic ');
    const decoded = atob(authHeader.replace('Basic ', ''));
    expect(decoded).toBe('test-client-id:the-secret');
  });
});
