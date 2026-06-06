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

import { z } from 'zod';
import { getContext } from '../context';
import { htmlEscape } from '../internal/html-escape';
import { singleFlight } from '../internal/single-flight';
import type { RouteResponse } from '../types';
import { defineRoute } from './routes';

// ─── HTML response helpers ─────────────────────────────────────────────────

/**
 * Build a minimal HTML RouteResponse. Centralizes the four ad-hoc HTML
 * builders we used to have inline and ensures every interpolated value
 * passes through {@link htmlEscape}.
 */
function htmlPage(args: {
  status: number;
  heading: string;
  bodyHtml: string;
  autoClose?: boolean;
}): RouteResponse {
  const close = args.autoClose ? '<script>setTimeout(()=>window.close(),3000)</script>' : '';
  return {
    status: args.status,
    headers: { 'Content-Type': 'text/html' },
    body: `<!doctype html><html><body style="font-family:system-ui;text-align:center;padding:3rem"><h2>${args.heading}</h2>${args.bodyHtml}${close}</body></html>`,
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

/** A stored token: access + expiry are required; token_type defaults to Bearer. */
const OAuthTokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_at: z.number(),
  token_type: z.string().default('Bearer'),
});

/** The raw token-endpoint payload. `expires_in` is seconds-from-now. */
const TokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().default(3600),
  token_type: z.string().default('Bearer'),
});

/** Read a string preference, returning undefined if absent or not a string. */
function getStringPreference(key: string): string | undefined {
  return z.string().safeParse(getContext().getPreferences()[key]).data;
}

/** Parse an OAuth token response into our OAuthToken shape. */
function parseTokenResponse(json: unknown, existingRefreshToken?: string): OAuthToken | null {
  const parsed = TokenResponseSchema.safeParse(json);
  if (!parsed.success) {
    return null;
  }
  const data = parsed.data;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? existingRefreshToken,
    expires_at: Date.now() + data.expires_in * 1000,
    token_type: data.token_type,
  };
}

/** Check if a stored value looks like an OAuthToken. */
function isOAuthToken(value: unknown): value is OAuthToken {
  return OAuthTokenSchema.safeParse(value).success;
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

  // In-flight PKCE verifiers keyed by state parameter. Bounded by TTL +
  // size — without these limits the map would grow on every /authorize hit
  // and only shrink on successful /callback, leaking memory and giving an
  // unauthenticated attacker a trivial DoS by hammering /authorize.
  const pendingVerifiers = new Map<string, { verifier: string; expiresAt: number }>();
  const PKCE_TTL_MS = 10 * 60 * 1000; // 10 minutes — well above any sane auth flow
  const PKCE_MAX_ENTRIES = 64;

  const callbackPath = `/oauth/${config.id}/callback`;
  const authorizePath = `/oauth/${config.id}/authorize`;

  /**
   * Drop expired entries, then evict oldest survivors until under the cap.
   * Relies on `Map`'s insertion-order iteration (oldest first).
   */
  function evictPkceEntries(): void {
    const now = Date.now();
    for (const [state, entry] of pendingVerifiers) {
      if (entry.expiresAt <= now) {
        pendingVerifiers.delete(state);
      } else {
        // Insertion-order iteration; once we hit an unexpired entry, no
        // earlier ones could be expired (they'd have been removed already).
        break;
      }
    }
    while (pendingVerifiers.size >= PKCE_MAX_ENTRIES) {
      const oldest = pendingVerifiers.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      pendingVerifiers.delete(oldest);
    }
  }

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
      evictPkceEntries();
      pendingVerifiers.set(state, { verifier, expiresAt: Date.now() + PKCE_TTL_MS });
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

  /**
   * Resolve the PKCE code verifier for the given state, cleaning up the
   * pending map. Re-checks the entry's expiry on lookup — even if
   * eviction hasn't run yet, a stored-but-expired entry is rejected.
   */
  function resolvePkceVerifier(state: string | undefined): string | null {
    if (!state) {
      return null;
    }
    const entry = pendingVerifiers.get(state);
    if (!entry) {
      return null;
    }
    pendingVerifiers.delete(state);
    if (entry.expiresAt <= Date.now()) {
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
        return htmlPage({
          status: 400,
          heading: 'Invalid state — PKCE verifier not found',
          bodyHtml: '<p>Try authorizing again.</p>',
        });
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
      // 502: failure originates upstream (the OAuth provider), not the user.
      // text comes from the OAuth provider's response body — escape it.
      return htmlPage({
        status: 502,
        heading: 'Token exchange failed',
        bodyHtml: `<pre>${htmlEscape(text)}</pre>`,
      });
    }

    const token = parseTokenResponse(await response.json());
    if (!token) {
      // 502: upstream returned a body that didn't match the OAuth spec.
      return htmlPage({
        status: 502,
        heading: 'Invalid token response',
        bodyHtml: '<p>The upstream OAuth server returned a malformed response.</p>',
      });
    }

    ctx.updatePreference(tokenPrefKey, token);

    return htmlPage({
      status: 200,
      heading: 'Connected!',
      bodyHtml: '<p>You can close this window.</p>',
      autoClose: true,
    });
  }

  // ─── Callback route ─────────────────────────────────────────────────────

  defineRoute('GET', callbackPath, async (req) => {
    const error = req.query.error;

    if (error) {
      // `error` arrives from the OAuth provider's redirect query string —
      // both the user and the upstream provider can influence its content.
      // 400: this is a user-visible authorization failure.
      return htmlPage({
        status: 400,
        heading: 'Authorization failed',
        bodyHtml: `<p>${htmlEscape(error)}</p>`,
        autoClose: true,
      });
    }

    const code = req.query.code;
    if (!code) {
      return htmlPage({
        status: 400,
        heading: 'Missing authorization code',
        bodyHtml: '',
      });
    }

    try {
      return await exchangeCodeForToken(code, req.query.state, req.headers);
    } catch (e) {
      // Exception messages can carry attacker-controlled text (e.g., upstream
      // error bodies that surfaced as `throw new Error(text)` in fetch).
      const message = e instanceof Error ? e.message : String(e);
      return htmlPage({
        status: 500,
        heading: 'Error',
        bodyHtml: `<p>${htmlEscape(message)}</p>`,
      });
    }
  });

  // ─── Token refresh ──────────────────────────────────────────────────────

  async function refreshToken(token: OAuthToken): Promise<OAuthToken | null> {
    if (!token.refresh_token) {
      return null;
    }

    try {
      const clientId = getClientId();

      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token,
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

      const newToken = parseTokenResponse(await response.json(), token.refresh_token);
      if (!newToken) {
        return null;
      }

      ctx.updatePreference(tokenPrefKey, newToken);
      return newToken;
    } catch {
      return null;
    }
  }

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

      // Refresh if expired (with 60s buffer). Refresh goes through a
      // single-flight gate so concurrent fetch() calls share one POST
      // grant_type=refresh_token — providers that rotate refresh tokens
      // (Spotify, Google, Microsoft) accept the first and return
      // `invalid_grant` to any racing sibling, which would clobber the
      // freshly-stored token and force the user to re-authorize.
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

  // Coalesce concurrent refresh attempts to a single network round-trip.
  // The closure re-reads `client.getToken()` on each invocation so callers
  // arriving after a successful refresh adopt the new token automatically.
  const refreshTokenOnce = singleFlight<OAuthToken | null>(() => {
    const current = client.getToken();
    if (!current) {
      return Promise.resolve(null);
    }
    return refreshToken(current);
  });

  return client;
}
