/**
 * @brika/auth - Configuration
 *
 * Runtime-configurable auth settings. The hub passes config via the
 * auth plugin; defaults apply when no config is provided.
 *
 * @example
 * auth({ dataDir, server, config: { session: { ttl: 86400 } } })
 */

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
};

let _config: ResolvedAuthConfig = AUTH_DEFAULTS;

/** Initialize auth config. Call once during bootstrap. */
export function initAuthConfig(config?: AuthConfig): ResolvedAuthConfig {
  _config = {
    session: { ...AUTH_DEFAULTS.session, ...config?.session },
    password: { ...AUTH_DEFAULTS.password, ...config?.password },
  };
  return _config;
}

/** Get the resolved auth config. */
export function getAuthConfig(): ResolvedAuthConfig {
  return _config;
}
