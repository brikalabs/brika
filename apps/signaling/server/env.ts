/**
 * Single source of truth for `Env` — schema + derived TS type.
 *
 * Workers has no startup hook that receives `env` (modules are imported
 * per-isolate; `env` arrives per-request), so the closest equivalent to
 * boot-time validation is to parse once on the first request of each
 * isolate and skip every subsequent one. `validateEnvOnce` does that via
 * a module-scoped flag — effectively free for the warm path.
 *
 * Two distinct classes of `Env` fields:
 *   - Cloudflare bindings (DO namespace, D1 database, static-asset Fetcher).
 *     These are object references injected by the runtime; we validate
 *     presence via `z.custom` and trust the runtime's typing for the rest.
 *   - Secrets / env vars (strings from `wrangler secret put` or `.dev.vars`).
 *     Missing secrets surface as the empty string at runtime — exactly the
 *     case the type system can't catch — so the schema enforces non-empty
 *     and a minimum length where it matters cryptographically.
 */

import { z } from 'zod';

export class EnvConfigError extends Error {
  override readonly name = 'EnvConfigError';
}

const bindingPresent = <T>(label: string) =>
  z.custom<T>((v) => v != null && typeof v === 'object', `${label} binding missing`);

export const EnvSchema = z.object({
  /** Durable Object namespace for `HubSession`. Configured in wrangler.toml. */
  HUB_SESSION: bindingPresent<DurableObjectNamespace>('HUB_SESSION'),
  /** D1 binding for the persistent claims table. Configured in wrangler.toml. */
  DB: bindingPresent<D1Database>('DB'),
  /** Static-asset binding (the bundled UI shell). Configured in wrangler.toml. */
  ASSETS: bindingPresent<Fetcher>('ASSETS'),
  /**
   * HMAC key for ticket signing. Set with `wrangler secret put TICKET_SECRET`
   * in production; lives in `.dev.vars` locally. ≥16 chars enforced because
   * `crypto.subtle.importKey` crashes with a cryptic 0-bit DataError on empty
   * input — exactly the case the type system can't catch.
   */
  TICKET_SECRET: z
    .string()
    .min(
      16,
      'TICKET_SECRET is unset or shorter than 16 chars. ' +
        'Locally: create `apps/signaling/.dev.vars` with `TICKET_SECRET="<32+ random bytes>"` ' +
        '(see `.dev.vars.example`). In production: `wrangler secret put TICKET_SECRET`.'
    ),
  /**
   * Comma-separated list of origins allowed to call state-changing browser
   * endpoints (`/v1/hubs/claim`, `/v1/tickets`). CSRF defense for cookie-bearing
   * UIs that might be tricked into minting a ticket against an attacker's hub.
   * Unset → defaults to `https://hub.brika.dev`.
   */
  ALLOWED_ORIGINS: z.string().optional(),
  /**
   * Cloudflare Realtime app ID for minting short-lived TURN credentials.
   * Unset → the coordinator returns STUN-only; symmetric/CGNAT users
   * (most mobile/5G) will fail to connect.
   */
  CF_REALTIME_APP_ID: z.string().optional(),
  /** Cloudflare Realtime app token (Bearer). Set via `wrangler secret put`. */
  CF_REALTIME_APP_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let validated = false;

/**
 * Parse `env` once per isolate. Subsequent calls are a no-op.
 *
 * If validation fails the flag stays unset so the next request retries —
 * that's the right shape for transient miniflare reload edge cases, and a
 * permanently broken deploy will simply keep throwing until the operator
 * fixes the secret.
 */
export function validateEnvOnce(env: Env): void {
  if (validated) {
    return;
  }
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    throw new EnvConfigError(detail);
  }
  validated = true;
}
