/**
 * @brika/auth - Configuration
 *
 * Runtime-configurable auth settings. The hub passes config via the
 * auth plugin; defaults apply when no config is provided.
 *
 * @example
 * auth({ dataDir, server, config: { session: { ttl: 86400 } } })
 */

import type { Session } from './types';

/**
 * Hook for resolving an opaque bearer token to a `Session` without a
 * database lookup. Returning `null` lets the middleware fall through
 * to the normal session validation path.
 *
 * The hub uses this to recognise the CLI's local-trust token: the
 * supervisor writes a per-instance token to `${BRIKA_HOME}/cli-token`
 * (0600) on start; the CLI reads it and sends it as `Bearer …` so
 * every `/api/*` call from the same machine is authenticated as the
 * admin principal without a login flow.
 */
export type StaticTokenResolver = (token: string) => Session | null;

export interface AuthConfig {
  session?: {
    /** Session TTL in seconds (default: 604800 = 7 days) */
    ttl?: number;
    /** Cookie name (default: 'brika_session') */
    cookieName?: string;
    /** Max active sessions per user (default: 10). Oldest sessions are revoked when exceeded. */
    maxPerUser?: number;
  };
  password?: {
    /** Minimum length (default: 8) */
    minLength?: number;
    /** Require uppercase letter (default: true) */
    requireUppercase?: boolean;
    /** Require digit (default: true) */
    requireNumbers?: boolean;
    /** Require special character (default: true) */
    requireSpecial?: boolean;
  };
  /**
   * Optional pre-DB resolver consulted by `verifyToken` for every
   * incoming bearer/cookie token. Used by the hub to honour the
   * local CLI trust token (see {@link StaticTokenResolver}).
   */
  staticTokenResolver?: StaticTokenResolver;
}

export interface ResolvedAuthConfig {
  session: {
    ttl: number;
    cookieName: string;
    maxPerUser: number;
  };
  password: {
    minLength: number;
    requireUppercase: boolean;
    requireNumbers: boolean;
    requireSpecial: boolean;
    specialChars: RegExp;
  };
  staticTokenResolver: StaticTokenResolver | null;
}

export const AUTH_DEFAULTS: ResolvedAuthConfig = {
  session: {
    ttl: 604800, // 7 days
    cookieName: 'brika_session',
    maxPerUser: 10,
  },
  password: {
    minLength: 8,
    requireUppercase: true,
    requireNumbers: true,
    requireSpecial: true,
    specialChars: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/,
  },
  staticTokenResolver: null,
};

let _config: ResolvedAuthConfig = AUTH_DEFAULTS;

/** Initialize auth config. Call once during bootstrap. */
export function initAuthConfig(config?: AuthConfig): ResolvedAuthConfig {
  _config = {
    session: {
      ...AUTH_DEFAULTS.session,
      ...config?.session,
    },
    password: {
      ...AUTH_DEFAULTS.password,
      ...config?.password,
    },
    staticTokenResolver: config?.staticTokenResolver ?? null,
  };
  return _config;
}

/** Get the resolved auth config. */
export function getAuthConfig(): ResolvedAuthConfig {
  return _config;
}
