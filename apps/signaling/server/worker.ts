/**
 * Brika signaling Worker — Cloudflare entry.
 *
 * Per request: validate env, build `AppDeps` from CF bindings (D1 claims,
 * DO-backed session forwarding, Cloudflare Realtime ICE, ASSETS binding for
 * the SPA), then hand off to the shared {@link buildApp} router.
 *
 * Every behaviour beyond CF-specific wiring lives in `app.ts` so the
 * standalone Bun/Node/Deno entry can reuse it unchanged.
 */

import { CloudflareIceServerProvider } from '@brika/remote-access-protocol';
import { type AppDeps, buildApp } from './app';
import { createD1ClaimStore } from './claims-d1';
import { checkEnv, type Env } from './env';
import { InMemoryRateLimiter } from './rate-limit';

export type { Env } from './env';
// Cloudflare needs the Durable Object class exported from the entry module.
export { HubSession } from './hub-session';

/**
 * Resolve the DO stub that owns a given hub-name's session.
 *
 * `idFromName(lower-case)` is deterministic — the worker and any concurrent
 * isolate always reach the same DO instance for the same hub.
 */
function doStubFor(env: Env, hubName: string): DurableObjectStub {
  const id = env.HUB_SESSION.idFromName(hubName.toLowerCase());
  return env.HUB_SESSION.get(id);
}

/**
 * Per-isolate rate limiter — sufficient as a defense-in-depth tier
 * underneath any CF-account-level rate-limit rules an operator has
 * configured. Multi-isolate coordination is intentionally not done here;
 * the bucket sizes are tight enough that drift between isolates does not
 * meaningfully widen the attack surface.
 */
const limiter = new InMemoryRateLimiter();

function depsFromEnv(env: Env): AppDeps {
  return {
    claims: createD1ClaimStore(env.DB),
    ice: new CloudflareIceServerProvider({
      appId: env.CF_REALTIME_APP_ID ?? '',
      token: env.CF_REALTIME_APP_TOKEN ?? '',
    }),
    ticketSecret: env.TICKET_SECRET,
    allowedOrigins: env.ALLOWED_ORIGINS
      ? env.ALLOWED_ORIGINS.split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
    assets: env.ASSETS,
    hubUpgrade: (name, req) => doStubFor(env, name).fetch(req),
    clientUpgrade: (name, req) => doStubFor(env, name).fetch(req),
    hubStatus: async (name) => {
      // The DO recognises `/internal/status` as a non-WS probe. The host is
      // `do.invalid` — the RFC 2606-reserved TLD makes it obvious to a
      // reader that this URL is never dialed; the DO only inspects path +
      // query.
      const probeUrl = `https://do.invalid/internal/status?name=${encodeURIComponent(name)}`;
      const res = await doStubFor(env, name).fetch(probeUrl);
      return (await res.json()) as { hubOnline: boolean; activeSessions: number };
    },
    rateLimit: (req, bucket) => limiter.check(req, bucket),
  };
}

export default {
  fetch(req, env, ctx) {
    const misconfigured = checkEnv(env);
    if (misconfigured) {
      return misconfigured;
    }
    return buildApp(depsFromEnv(env)).fetch(req, env, ctx);
  },
} satisfies ExportedHandler<Env>;
