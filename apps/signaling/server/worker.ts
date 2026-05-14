/**
 * Brika signaling Worker.
 *
 * Routes:
 *   - GET    /v1/health                liveness probe
 *   - POST   /v1/hubs/claim            first-come-first-serve name claim
 *   - GET    /v1/hubs/:name/status     per-hub liveness probe
 *   - POST   /v1/hubs/:name/rotate     rotate the bearer token (bearer-auth)
 *   - DELETE /v1/hubs/:name            release a claim (bearer-auth)
 *   - POST   /v1/tickets               mint a short-lived signed ticket
 *   - WS     /v1/hub                   long-lived hub signaling
 *   - WS     /v1/client?hub=&ticket=   per-session browser signaling
 *
 * The Worker handles HTTP itself but proxies every WebSocket upgrade into the
 * `HubSession` Durable Object that owns the named hub. Claim persistence
 * lives in D1.
 *
 * Routing uses Hono — same router family the in-process `apps/hub` uses, so
 * the shape (param extraction, middleware composition) is consistent across
 * the codebase. WebSocket upgrades are handled by returning the raw
 * `WebSocketPair`-bound `Response` from a handler; Hono passes those through
 * unchanged.
 */

import {
  constantTimeEqual,
  DEFAULT_ICE_SERVERS,
  fetchCloudflareIceServers,
  parseSubprotocols,
} from '@brika/remote-access-protocol';
import { Hono } from 'hono';
import { ClaimError, D1ClaimStore } from './claims-d1';
import { injectHubMeta, resolveHubFromUrl } from './hub-resolution';
import { mintTicket, verifyTicket } from './tickets';

// Cloudflare needs the Durable Object class exported from the entry module so
// it can instantiate it. `export ... from` keeps the re-export pure (rather
// than via an import + named re-export which the linter rightly flags).
export { HubSession } from './hub-session';

export interface Env {
  HUB_SESSION: DurableObjectNamespace;
  DB: D1Database;
  /** HMAC key for ticket signing. Set with `wrangler secret put TICKET_SECRET`. */
  TICKET_SECRET: string;
  /** Static asset binding (the bundled UI shell). Configured in wrangler.toml. */
  ASSETS: Fetcher;
  /**
   * Comma-separated list of origins allowed to call the state-changing browser
   * endpoints (`/v1/hubs/claim`, `/v1/tickets`). Cross-origin POSTs from any
   * other host are rejected with 403 — CSRF defense for cookie-bearing UIs that
   * might be tricked into minting a ticket against an attacker's hub.
   * Unset → defaults to `https://hub.brika.dev`.
   */
  ALLOWED_ORIGINS?: string;
  /**
   * Cloudflare Realtime app ID for minting short-lived TURN credentials.
   * Unset → the coordinator returns STUN-only; symmetric/CGNAT users
   * (most mobile/5G) will fail to connect.
   */
  CF_REALTIME_APP_ID?: string;
  /** Cloudflare Realtime app token (Bearer). Set via `wrangler secret put`. */
  CF_REALTIME_APP_TOKEN?: string;
}

const DEFAULT_ALLOWED_ORIGINS: readonly string[] = ['https://hub.brika.dev'];

// ─── Helpers ────────────────────────────────────────────────────────────────

function originAllowed(req: Request, env: Env): boolean {
  const origin = req.headers.get('origin');
  if (!origin) {
    // CLI, server-to-server, or same-origin GET → no Origin header. Allow.
    return true;
  }
  // Localhost is always trusted. The browser sets `Origin` to the actual
  // page origin and cannot be forged by a cross-origin attacker, so a
  // localhost value here proves the request came from a page on this
  // machine — exactly the dev path. Without this `bun run dev` would 403
  // on every `/v1/*` mutating call because the dev server defaults to
  // serving the bootstrap on http://localhost:<port>.
  try {
    const { hostname } = new URL(origin);
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }
  } catch {
    // Malformed Origin → fall through to explicit allowlist check.
  }
  const list = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;
  return list.includes(origin);
}

function bearerFromAuthHeader(req: Request): string {
  const auth = req.headers.get('authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
}

function claimErrorStatus(code: ClaimError['code']): number {
  switch (code) {
    case 'invalid-name':
      return 400;
    case 'reserved':
      return 403;
    case 'taken':
      return 409;
    case 'unauthorized':
      return 401;
    default:
      return 404;
  }
}

function doStubFor(env: Env, hubName: string): DurableObjectStub {
  // `idFromName` deterministically maps the hub name to a stable DO id.
  const id = env.HUB_SESSION.idFromName(hubName.toLowerCase());
  return env.HUB_SESSION.get(id);
}

/**
 * STUN defaults merged with a fresh Cloudflare TURN credential pair (when
 * configured). Soft-fails to STUN-only on missing creds or API error.
 */
async function resolveIceServers(env: Env): Promise<ReadonlyArray<unknown>> {
  const turn = await fetchCloudflareIceServers({
    appId: env.CF_REALTIME_APP_ID ?? '',
    token: env.CF_REALTIME_APP_TOKEN ?? '',
  });
  return turn.length > 0 ? [...DEFAULT_ICE_SERVERS, ...turn] : DEFAULT_ICE_SERVERS;
}

// ─── App ────────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

app.get('/v1/health', async (c) => {
  const claims = new D1ClaimStore(c.env.DB);
  return c.json({ ok: true, claims: await claims.size() });
});

app.post('/v1/hubs/claim', async (c) => {
  if (!originAllowed(c.req.raw, c.env)) {
    return c.json({ error: 'forbidden origin' }, 403);
  }
  const body = await c.req.json<{ name?: string }>().catch(() => null);
  if (!body?.name || typeof body.name !== 'string') {
    return c.json({ error: 'name required' }, 400);
  }
  const claims = new D1ClaimStore(c.env.DB);
  try {
    const claim = await claims.claim(body.name);
    return c.json({ name: claim.name, token: claim.token, createdAt: claim.createdAt });
  } catch (err) {
    if (err instanceof ClaimError) {
      const status = claimErrorStatus(err.code);
      return c.json({ error: err.message, code: err.code }, status as 400 | 401 | 403 | 404 | 409);
    }
    throw err;
  }
});

app.get('/v1/hubs/:name/status', async (c) => {
  const lower = c.req.param('name').toLowerCase();
  const claims = new D1ClaimStore(c.env.DB);
  if (!(await claims.get(lower))) {
    return c.json({ error: 'Unknown hub' }, 404);
  }
  // The DO recognizes `/internal/status` as a non-WS introspection endpoint.
  const stub = doStubFor(c.env, lower);
  const probeUrl = `https://internal.brika.dev/internal/status?name=${encodeURIComponent(lower)}`;
  return stub.fetch(probeUrl);
});

app.post('/v1/hubs/:name/rotate', async (c) => {
  const claims = new D1ClaimStore(c.env.DB);
  const token = bearerFromAuthHeader(c.req.raw);
  const owner = await claims.findByToken(token);
  if (!owner || !constantTimeEqual(owner.name, c.req.param('name').toLowerCase())) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const next = await claims.rotateToken(owner.name);
  return c.json({ name: next.name, token: next.token });
});

app.delete('/v1/hubs/:name', async (c) => {
  const claims = new D1ClaimStore(c.env.DB);
  const token = bearerFromAuthHeader(c.req.raw);
  const owner = await claims.findByToken(token);
  if (!owner || !constantTimeEqual(owner.name, c.req.param('name').toLowerCase())) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await claims.release(owner.name);
  return c.json({ ok: true });
});

app.post('/v1/tickets', async (c) => {
  if (!originAllowed(c.req.raw, c.env)) {
    return c.json({ error: 'forbidden origin' }, 403);
  }
  const body = await c.req.json<{ hubName?: string }>().catch(() => null);
  if (!body?.hubName || typeof body.hubName !== 'string') {
    return c.json({ error: 'hubName required' }, 400);
  }
  const claims = new D1ClaimStore(c.env.DB);
  if (!(await claims.get(body.hubName))) {
    return c.json({ error: 'Unknown hub' }, 404);
  }
  const { ticket, expiresAt } = await mintTicket(c.env.TICKET_SECRET, body.hubName);
  const iceServers = await resolveIceServers(c.env);
  return c.json({ ticket, expiresAt, iceServers });
});

// ─── WebSocket upgrade routes ───────────────────────────────────────────────
//
// The DO is authoritative for the actual upgrade — the Worker only authn's
// the request (bearer for hub, ticket for client), maps to the correct DO,
// and proxies the *original* Request through. CF's Fetch API strips
// `Upgrade` / `Sec-WebSocket-*` when reconstructing a Request, so the DO
// derives role from `url.pathname` and re-validates from surviving fields.

app.all('/v1/hub', async (c) => {
  const subs = parseSubprotocols(c.req.header('sec-websocket-protocol') ?? null);
  if (!subs.proto?.startsWith('brika.v')) {
    return new Response('Unsupported protocol', { status: 400 });
  }
  const token = subs.bearer ?? '';
  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }
  const claims = new D1ClaimStore(c.env.DB);
  const owner = await claims.findByToken(token);
  if (!owner || !constantTimeEqual(owner.token, token)) {
    return new Response('Unauthorized', { status: 401 });
  }
  return doStubFor(c.env, owner.name).fetch(c.req.raw);
});

app.all('/v1/client', async (c) => {
  const hubName = c.req.query('hub');
  const ticket = c.req.query('ticket');
  if (!hubName || !ticket) {
    return new Response('hub and ticket required', { status: 400 });
  }
  const claims = await verifyTicket(c.env.TICKET_SECRET, ticket);
  if (claims?.hub !== hubName) {
    return new Response('Invalid ticket', { status: 401 });
  }
  const store = new D1ClaimStore(c.env.DB);
  if (!(await store.get(hubName))) {
    return new Response('Unknown hub', { status: 404 });
  }
  return doStubFor(c.env, hubName).fetch(c.req.raw);
});

// Unrecognised `/v1/*` must not fall through to the static-asset binding.
app.all('/v1/*', (c) => c.json({ error: 'Not found' }, 404));

// Anything else is a UI request — let the asset binding serve it, but first
// see whether the (host, path) identifies a hub so we can stamp its name
// into the document for the bootstrap script.
app.all('*', async (c) => {
  const url = new URL(c.req.url);
  const resolved = resolveHubFromUrl(url);
  if (!resolved) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  // Normalise to the asset-binding's view of the world: a request for
  // `<restPath>` on the same origin. The asset binding has a single SPA
  // fallback (`/index.html`) so this works for any sub-path.
  const normalisedUrl = new URL(resolved.restPath + url.search, url.origin);
  const assetReq = new Request(normalisedUrl.toString(), c.req.raw);
  const assetRes = await c.env.ASSETS.fetch(assetReq);
  return injectHubMeta(assetRes, resolved.hubName);
});

export default app satisfies ExportedHandler<Env>;
