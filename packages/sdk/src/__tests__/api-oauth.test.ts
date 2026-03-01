/**
 * Tests for SDK OAuth API
 *
 * Tests the defineOAuth function: client interface, auth URL generation,
 * token retrieval, authentication checks, and fetch error handling.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { OAuthClient, OAuthProviderConfig, OAuthToken } from '../api/oauth';

// ─── Mock Setup ────────────────────────────────────────────────────────────────

const preferences: Record<string, unknown> = {};
const registeredRoutes: Array<{
  method: string;
  path: string;
  handler: Function;
}> = [];

const mockGetPreferences = mock(() => preferences);
const mockUpdatePreference = mock((key: string, value: unknown) => {
  preferences[key] = value;
});
const mockRegisterRoute = mock((method: string, path: string, handler: Function) => {
  registeredRoutes.push({
    method,
    path,
    handler,
  });
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

// defineRoute delegates to getContext().registerRoute — the mock above handles it
const { defineOAuth } = await import('../api/oauth');

// ─── Helpers ───────────────────────────────────────────────────────────────────

function createConfig(overrides?: Partial<OAuthProviderConfig>): OAuthProviderConfig {
  return {
    id: 'test-provider',
    authorizeUrl: 'https://auth.example.com/authorize',
    tokenUrl: 'https://auth.example.com/token',
    scopes: [
      'read',
    ],
    clientId: 'test-client-id',
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('OAuth types', () => {
  test('OAuthProviderConfig shape', () => {
    const config: OAuthProviderConfig = {
      id: 'test',
      authorizeUrl: 'https://auth.example.com/authorize',
      tokenUrl: 'https://auth.example.com/token',
      scopes: [
        'read',
        'write',
      ],
      clientId: 'test-client-id',
    };
    expect(config.id).toBe('test');
    expect(config.scopes).toHaveLength(2);
    expect(config.pkce).toBeUndefined();
  });

  test('OAuthToken shape', () => {
    const token: OAuthToken = {
      access_token: 'abc123',
      refresh_token: 'def456',
      expires_at: Date.now() + 3600000,
      token_type: 'Bearer',
    };
    expect(token.access_token).toBe('abc123');
    expect(token.token_type).toBe('Bearer');
  });

  test('OAuthProviderConfig with preference keys and pkce disabled', () => {
    const config: OAuthProviderConfig = {
      id: 'google',
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: [
        'profile',
      ],
      clientIdPreference: 'clientId',
      clientSecretPreference: 'clientSecret',
      pkce: false,
    };
    expect(config.pkce).toBe(false);
    expect(config.clientIdPreference).toBe('clientId');
  });
});

describe('defineOAuth', () => {
  beforeEach(() => {
    for (const key of Object.keys(preferences)) {
      delete preferences[key];
    }
    registeredRoutes.length = 0;
    mockGetPreferences.mockClear();
    mockUpdatePreference.mockClear();
    mockRegisterRoute.mockClear();
  });

  test('returns an OAuthClient with all methods', () => {
    const client = defineOAuth(createConfig());

    expect(typeof client.getAuthUrl).toBe('function');
    expect(typeof client.getToken).toBe('function');
    expect(typeof client.isAuthenticated).toBe('function');
    expect(typeof client.fetch).toBe('function');
  });

  test('registers authorize and callback routes', () => {
    defineOAuth(
      createConfig({
        id: 'spotify',
      })
    );

    // defineRoute calls registerRoute on the context
    expect(mockRegisterRoute).toHaveBeenCalledTimes(2);

    const paths = mockRegisterRoute.mock.calls.map((c) => c[1]);
    expect(paths).toContain('/oauth/spotify/authorize');
    expect(paths).toContain('/oauth/spotify/callback');
  });

  test('getAuthUrl returns the correct API path', () => {
    const client = defineOAuth(
      createConfig({
        id: 'spotify',
      })
    );
    expect(client.getAuthUrl()).toBe('/api/oauth/spotify/authorize');
  });

  test('getToken returns null when no token is stored', () => {
    const client = defineOAuth(
      createConfig({
        id: 'empty',
      })
    );
    expect(client.getToken()).toBeNull();
  });

  test('getToken returns stored token', () => {
    const client = defineOAuth(
      createConfig({
        id: 'stored',
      })
    );

    preferences['__oauth_stored_token'] = {
      access_token: 'valid-token',
      expires_at: Date.now() + 3600000,
      token_type: 'Bearer',
    };

    const token = client.getToken();
    expect(token).not.toBeNull();
    expect(token?.access_token).toBe('valid-token');
    expect(token?.token_type).toBe('Bearer');
  });

  test('getToken returns null for invalid stored value', () => {
    const client = defineOAuth(
      createConfig({
        id: 'invalid',
      })
    );

    // Not a valid token shape (missing access_token)
    preferences['__oauth_invalid_token'] = {
      foo: 'bar',
    };

    expect(client.getToken()).toBeNull();
  });

  test('isAuthenticated returns false when no token exists', () => {
    const client = defineOAuth(
      createConfig({
        id: 'noauth',
      })
    );
    expect(client.isAuthenticated()).toBe(false);
  });

  test('isAuthenticated returns true when valid token is stored', () => {
    const client = defineOAuth(
      createConfig({
        id: 'authed',
      })
    );

    preferences['__oauth_authed_token'] = {
      access_token: 'valid-token',
      expires_at: Date.now() + 3600000,
      token_type: 'Bearer',
    };

    expect(client.isAuthenticated()).toBe(true);
  });

  test('fetch throws when not authenticated', () => {
    const client = defineOAuth(
      createConfig({
        id: 'unauthed',
      })
    );

    expect(client.fetch('https://api.example.com/data')).rejects.toThrow('Not authenticated');
  });

  test('fetch throws descriptive message with auth URL', () => {
    const client = defineOAuth(
      createConfig({
        id: 'nope',
      })
    );

    expect(client.fetch('https://api.example.com/data')).rejects.toThrow(
      '/api/oauth/nope/authorize'
    );
  });

  test('getAuthUrl uses the config id in the path', () => {
    const client1 = defineOAuth(
      createConfig({
        id: 'github',
      })
    );
    const client2 = defineOAuth(
      createConfig({
        id: 'slack',
      })
    );

    expect(client1.getAuthUrl()).toBe('/api/oauth/github/authorize');
    expect(client2.getAuthUrl()).toBe('/api/oauth/slack/authorize');
  });

  test('token preference key uses provider id', () => {
    const client = defineOAuth(
      createConfig({
        id: 'keyed',
      })
    );

    // No token stored under expected key
    expect(client.getToken()).toBeNull();

    // Store under the correct key
    preferences['__oauth_keyed_token'] = {
      access_token: 'found',
      expires_at: Date.now() + 3600000,
      token_type: 'Bearer',
    };
    expect(client.getToken()?.access_token).toBe('found');

    // Wrong key should not affect it
    preferences['__oauth_other_token'] = {
      access_token: 'wrong',
      expires_at: Date.now() + 3600000,
      token_type: 'Bearer',
    };
    expect(client.getToken()?.access_token).toBe('found');
  });

  test('isAuthenticated returns false when token has no access_token', () => {
    const client = defineOAuth(
      createConfig({
        id: 'partial',
      })
    );

    // Stored value has expires_at but no access_token — isOAuthToken returns false
    preferences['__oauth_partial_token'] = {
      expires_at: Date.now() + 3600000,
      token_type: 'Bearer',
    };

    expect(client.isAuthenticated()).toBe(false);
  });

  test('getToken returns token with optional refresh_token', () => {
    const client = defineOAuth(
      createConfig({
        id: 'refresh',
      })
    );

    preferences['__oauth_refresh_token'] = {
      access_token: 'at',
      refresh_token: 'rt',
      expires_at: Date.now() + 3600000,
      token_type: 'Bearer',
    };

    const token = client.getToken();
    expect(token?.refresh_token).toBe('rt');
  });
});
