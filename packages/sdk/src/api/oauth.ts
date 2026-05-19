/**
 * OAuth 2.0 Helper
 *
 * Reusable OAuth Authorization Code flow with PKCE for plugins.
 * Registers callback routes, handles token exchange and refresh,
 * and provides an authenticated fetch wrapper.
 *
 * @example PKCE flow (no client secret needed)
 * ```ts
 * import { defineOAuth } from '@brika/sdk';
 *
 * export const spotify = defineOAuth({
 *   id: 'spotify',
 *   authorizeUrl: 'https://accounts.spotify.com/authorize',
 *   tokenUrl: 'https://accounts.spotify.com/api/token',
 *   scopes: ['user-read-playback-state'],
 *   clientId: 'your-app-client-id',
 * });
 *
 * const res = await spotify.fetch('https://api.spotify.com/v1/me/player');
 * ```
 *
 * @example With client secret (non-PKCE)
 * ```ts
 * export const google = defineOAuth({
 *   id: 'google',
 *   authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
 *   tokenUrl: 'https://oauth2.googleapis.com/token',
 *   scopes: ['profile'],
 *   clientIdPreference: 'clientId',
 *   clientSecretPreference: 'clientSecret',
 *   pkce: false,
 * });
 * ```
 */

import { getContext } from '../context';
import { htmlEscape } from '../internal/html-escape';
import { singleFlight } from '../internal/single-flight';
import type { RouteResponse } from '../types';
import { defineRoute } from './routes';

/** Render a small status page. `body` is treated as HTML — escape user input before passing. */
function htmlPage(status: number, title: string, body = ''): RouteResponse {
  return {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!doctype html><html><body style="font-family:system-ui;text-align:center;padding:3rem"><h2>${title}</h2>${body}</body></html>`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface OAuthProviderConfig {
  /** Unique provider ID (e.g. "spotify", "google") */
  id: string;
  /** Authorization endpoint URL */
  authorizeUrl: string;
  /** Token exchange endpoint URL */
  tokenUrl: string;
  /** OAuth scopes to request */
  scopes: string[];
  /** Hardcoded client ID (takes priority over preference) */
  clientId?: string;
  /** Preference key to read client ID from (fallback if clientId not set) */
  clientIdPreference?: string;
  /** Hardcoded client secret (only for non-PKCE flows) */
  clientSecret?: string;
  /** Preference key to read client secret from (only for non-PKCE flows) */
  clientSecretPreference?: string;
  /** Use PKCE flow — eliminates the need for a client secret (default: true) */
  pkce?: boolean;
}

export interface OAuthToken {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  token_type: string;
}

export interface OAuthClient {
  /** Get the hub-served authorize URL path (relative, for UI links) */
  getAuthUrl(): string;
  /** Get the current stored token (null if not authenticated) */
  getToken(): OAuthToken | null;
  /** Check if the user is authenticated with a valid token */
  isAuthenticated(): boolean;
  /**
   * Make an authenticated HTTP request — auto-refreshes expired tokens.
   *
   * @throws {Error} if not authenticated (call `isAuthenticated()` first or check `getAuthUrl()`)
   * @throws {Error} if the token is expired and refresh fails (user must re-authorize)
   */
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

// ─────────────────────────────────────────────────────────────────────────────
// PKCE Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64url(bytes);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64url(new Uint8Array(hash));
}

function base64url(bytes: Uint8Array): string {
  const b64 = btoa(String.fromCodePoint(...bytes));
  return b64
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll(/={1,2}$/g, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Read a string preference, returning undefined if not a string. */
function getStringPreference(key: string): string | undefined {
  const val = getContext().getPreferences()[key];
  return typeof val === 'string' ? val : undefined;
}

/** Parse an OAuth token response into our OAuthToken shape. */
function parseTokenResponse(json: unknown, existingRefreshToken?: string): OAuthToken | null {
  if (!json || typeof json !== 'object') {
    return null;
  }
  const data = json as Record<string, unknown>;
  const accessToken = data.access_token;
  if (typeof accessToken !== 'string') {
    return null;
  }
  return {
    access_token: accessToken,
    refresh_token:
      (typeof data.refresh_token === 'string' ? data.refresh_token : undefined) ??
      existingRefreshToken,
    expires_at: Date.now() + (typeof data.expires_in === 'number' ? data.expires_in : 3600) * 1000,
    token_type: typeof data.token_type === 'string' ? data.token_type : 'Bearer',
  };
}

/** Type guard: check if a stored value looks like an OAuthToken. */
function isOAuthToken(value: unknown): value is OAuthToken {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return typeof obj.access_token === 'string' && typeof obj.expires_at === 'number';
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Define an OAuth 2.0 provider for a plugin.
 *
 * Registers two routes on the hub:
 * - `GET /oauth/{id}/authorize` — redirects to the provider's authorization page
 * - `GET /oauth/{id}/callback` — receives the auth code, exchanges it for tokens
 *
 * Uses PKCE by default (no client secret needed). Set `pkce: false` to use
 * the classic Authorization Code flow with a client secret.
 */
export function defineOAuth(config: OAuthProviderConfig): OAuthClient {
  const ctx = getContext();
  // `__secret_*` prefix tells the hub to route this value through the OS keychain
  // instead of brika.yml — see SecretStore + PluginConfigService.
  const tokenPrefKey = `__secret_oauth_${config.id}_token`;
  const usePkce = config.pkce !== false;

  // In-flight PKCE verifiers keyed by state parameter.
  // Bounded so an unauthenticated attacker hitting /authorize in a loop
  // cannot grow the map without bound; OAuth `code` lifetimes are short
  // (~10 min for major providers), so TTL also lets abandoned flows reclaim.
  const PKCE_TTL_MS = 10 * 60 * 1000;
  const PKCE_MAX_ENTRIES = 64;
  const pendingVerifiers = new Map<string, { verifier: string; expiresAt: number }>();

  function evictPkceEntries(now: number): void {
    // Map iteration order is insertion order; drop expired entries front-to-back
    // until the first live one, then enforce the size cap by evicting oldest.
    for (const [state, entry] of pendingVerifiers) {
      if (entry.expiresAt > now) {
        break;
      }
      pendingVerifiers.delete(state);
    }
    while (pendingVerifiers.size >= PKCE_MAX_ENTRIES) {
      const oldest = pendingVerifiers.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      pendingVerifiers.delete(oldest);
    }
  }

  const callbackPath = `/oauth/${config.id}/callback`;
  const authorizePath = `/oauth/${config.id}/authorize`;

  function getRedirectUri(headers: Record<string, string>): string {
    let host = headers['host'] || '127.0.0.1:3001';
    const proto = headers['x-forwarded-proto'] || 'http';

    // Normalize loopback to 127.0.0.1 — most OAuth providers (Spotify, Google)
    // require http://127.0.0.1 for local development, not localhost or 0.0.0.0
    host = host.replace(/^(localhost|0\.0\.0\.0)/, '127.0.0.1');

    return `${proto}://${host}/api${callbackPath}`;
  }

  function getClientId(): string {
    if (config.clientId) {
      return config.clientId;
    }
    if (config.clientIdPreference) {
      const id = getStringPreference(config.clientIdPreference);
      if (id) {
        return id;
      }
    }
    throw new Error(
      'Missing client ID. Set "clientId" in defineOAuth config or provide a clientIdPreference.'
    );
  }

  function getClientSecret(): string {
    if (config.clientSecret) {
      return config.clientSecret;
    }
    if (config.clientSecretPreference) {
      const secret = getStringPreference(config.clientSecretPreference);
      if (secret) {
        return secret;
      }
    }
    throw new Error(
      'Missing client secret. Set "clientSecret" in defineOAuth config or provide a clientSecretPreference.'
    );
  }

  /** Build auth headers for token requests (Basic auth for non-PKCE flows). */
  function buildTokenHeaders(clientId: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    if (!usePkce) {
      const clientSecret = getClientSecret();
      const credentials = `${clientId}:${clientSecret}`;
      headers['Authorization'] = `Basic ${btoa(credentials)}`;
    }
    return headers;
  }

  // ─── Authorize route ────────────────────────────────────────────────────

  defineRoute('GET', authorizePath, async (req) => {
    const clientId = getClientId();
    const redirectUri = getRedirectUri(req.headers);
    const state = crypto.randomUUID();

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: config.scopes.join(' '),
      state,
    });

    if (usePkce) {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);
      const now = Date.now();
      evictPkceEntries(now);
      pendingVerifiers.set(state, { verifier, expiresAt: now + PKCE_TTL_MS });
      params.set('code_challenge_method', 'S256');
      params.set('code_challenge', challenge);
    }

    return {
      status: 302,
      headers: {
        Location: `${config.authorizeUrl}?${params}`,
      },
    };
  });

  // ─── Callback helpers ───────────────────────────────────────────────────

  /** Resolve the PKCE code verifier for the given state, cleaning up the pending map. */
  function resolvePkceVerifier(state: string | undefined): string | null {
    if (!state) {
      return null;
    }
    const entry = pendingVerifiers.get(state);
    pendingVerifiers.delete(state);
    if (!entry || entry.expiresAt <= Date.now()) {
      return null;
    }
    return entry.verifier;
  }

  /** Exchange an authorization code for tokens, returning an HTML RouteResponse. */
  async function exchangeCodeForToken(
    code: string,
    state: string | undefined,
    headers: Record<string, string>
  ): Promise<RouteResponse> {
    const clientId = getClientId();
    const redirectUri = getRedirectUri(headers);

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
    });

    if (usePkce) {
      const verifier = resolvePkceVerifier(state);
      if (!verifier) {
        return htmlPage(
          400,
          'Invalid state — PKCE verifier not found',
          '<p>Try authorizing again.</p>'
        );
      }
      body.set('code_verifier', verifier);
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: buildTokenHeaders(clientId),
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      return htmlPage(502, 'Token exchange failed', `<pre>${htmlEscape(text)}</pre>`);
    }

    const token = parseTokenResponse(await response.json());
    if (!token) {
      return htmlPage(502, 'Invalid token response');
    }

    ctx.updatePreference(tokenPrefKey, token);

    return htmlPage(
      200,
      'Connected!',
      '<p>You can close this window.</p><script>setTimeout(()=>window.close(),2000)</script>'
    );
  }

  // ─── Callback route ─────────────────────────────────────────────────────

  defineRoute('GET', callbackPath, async (req) => {
    const error = req.query.error;

    if (error) {
      return htmlPage(
        400,
        'Authorization failed',
        `<p>${htmlEscape(error)}</p><script>setTimeout(()=>window.close(),3000)</script>`
      );
    }

    const code = req.query.code;
    if (!code) {
      return htmlPage(400, 'Missing authorization code');
    }

    try {
      return await exchangeCodeForToken(code, req.query.state, req.headers);
    } catch (e) {
      return htmlPage(500, 'Error', `<p>${htmlEscape(e)}</p>`);
    }
  });

  // ─── Token refresh ──────────────────────────────────────────────────────

  /**
   * Single-flighted refresh: concurrent callers share one POST.
   *
   * Without this, two parallel `client.fetch` calls hitting an expired token
   * both issue grant_type=refresh_token with the same refresh_token. Providers
   * that rotate refresh tokens (Spotify, Google) accept the first and return
   * invalid_grant for the second — which would clobber the freshly-stored
   * token via updatePreference and force the user to re-authorize.
   *
   * The closure re-reads the current token on each invocation so that callers
   * arriving after a successful refresh see the new token without issuing a
   * fresh POST.
   */
  const refreshTokenOnce = singleFlight(async (): Promise<OAuthToken | null> => {
    const current = client.getToken();
    if (!current?.refresh_token) {
      return null;
    }
    // A previous in-flight refresh that completed before us already wrote a
    // non-expired token — adopt it instead of issuing another POST.
    if (current.expires_at > Date.now() + 60_000) {
      return current;
    }

    try {
      const clientId = getClientId();

      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: current.refresh_token,
        client_id: clientId,
      });

      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: buildTokenHeaders(clientId),
        body,
      });

      if (!response.ok) {
        return null;
      }

      const newToken = parseTokenResponse(await response.json(), current.refresh_token);
      if (!newToken) {
        return null;
      }

      ctx.updatePreference(tokenPrefKey, newToken);
      return newToken;
    } catch {
      return null;
    }
  });

  // ─── Client ─────────────────────────────────────────────────────────────

  const client: OAuthClient = {
    getAuthUrl() {
      return `/api${authorizePath}`;
    },

    getToken() {
      const stored = ctx.getPreferences()[tokenPrefKey];
      return isOAuthToken(stored) ? stored : null;
    },

    isAuthenticated() {
      const token = client.getToken();
      return token?.access_token !== null && token?.access_token !== undefined;
    },

    async fetch(url: string, init?: RequestInit) {
      let token = client.getToken();
      if (!token) {
        throw new Error(`Not authenticated. Visit ${client.getAuthUrl()} to authorize.`);
      }

      // Refresh if expired (with 60s buffer). Concurrent callers share one POST.
      if (token.expires_at < Date.now() + 60_000) {
        const refreshed = await refreshTokenOnce();
        if (!refreshed) {
          throw new Error('Token expired and refresh failed. Re-authorize required.');
        }
        token = refreshed;
      }

      const headers = new Headers(init?.headers);
      headers.set('Authorization', `${token.token_type} ${token.access_token}`);

      return globalThis.fetch(url, {
        ...init,
        headers,
      });
    },
  };

  return client;
}
