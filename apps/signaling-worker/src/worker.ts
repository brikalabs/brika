/**
 * Brika signaling Worker.
 *
 * Routes:
 *   - GET    /v1/health                liveness probe
 *   - POST   /v1/hubs/claim            first-come-first-serve name claim
 *   - POST   /v1/hubs/:name/rotate     rotate the bearer token (bearer-auth)
 *   - DELETE /v1/hubs/:name            release a claim (bearer-auth)
 *   - POST   /v1/tickets               mint a short-lived signed ticket
 *   - WS     /v1/hub                   long-lived hub signaling
 *   - WS     /v1/client?hub=&ticket=   per-session browser signaling
 *
 * The Worker handles HTTP itself but proxies every WebSocket upgrade into the
 * `HubSession` Durable Object that owns the named hub. Claim persistence
 * lives in D1.
 */

import {
  constantTimeEqual,
  DEFAULT_ICE_SERVERS,
  parseSubprotocols,
} from '@brika/remote-access-protocol';
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
}

const DEFAULT_ALLOWED_ORIGINS: readonly string[] = ['https://hub.brika.dev'];

function originAllowed(req: Request, env: Env): boolean {
  const origin = req.headers.get('origin');
  if (!origin) {
    // CLI, server-to-server, or same-origin GET → no Origin header. Allow.
    return true;
  }
  const list = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;
  return list.includes(origin);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function jsonError(status: number, error: string, code?: string): Response {
  return new Response(JSON.stringify(code ? { error, code } : { error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return await req.json<T>();
  } catch {
    return null;
  }
}

function doStubFor(env: Env, hubName: string): DurableObjectStub {
  // `idFromName` deterministically maps the hub name to a stable DO id.
  const id = env.HUB_SESSION.idFromName(hubName.toLowerCase());
  return env.HUB_SESSION.get(id);
}

// ─── HTTP route handlers ────────────────────────────────────────────────────

async function handleHealth(env: Env): Promise<Response> {
  const claims = new D1ClaimStore(env.DB);
  return Response.json({ ok: true, claims: await claims.size() });
}

/**
 * Per-hub liveness probe. Used by operators to verify that their hub is
 * actually connected to the coordinator. The Worker itself doesn't track
 * which hubs are online — that's per-Durable-Object state — so we forward
 * a small synthetic GET to the named DO and have it answer.
 */
async function handleHubStatus(env: Env, name: string): Promise<Response> {
  const lower = name.toLowerCase();
  const claims = new D1ClaimStore(env.DB);
  if (!(await claims.get(lower))) {
    return jsonError(404, 'Unknown hub');
  }
  const stub = doStubFor(env, lower);
  // The DO recognizes `/internal/status` as a non-WS introspection endpoint.
  const probeUrl = new URL(
    `https://internal.brika.dev/internal/status?name=${encodeURIComponent(lower)}`
  );
  return stub.fetch(probeUrl.toString());
}

async function handleClaim(req: Request, env: Env): Promise<Response> {
  if (!originAllowed(req, env)) {
    return jsonError(403, 'forbidden origin');
  }
  const body = await readJson<{ name?: string }>(req);
  if (!body?.name || typeof body.name !== 'string') {
    return jsonError(400, 'name required');
  }
  const claims = new D1ClaimStore(env.DB);
  try {
    const claim = await claims.claim(body.name);
    return Response.json({
      name: claim.name,
      token: claim.token,
      createdAt: claim.createdAt,
    });
  } catch (err) {
    if (err instanceof ClaimError) {
      return jsonError(claimErrorStatus(err.code), err.message, err.code);
    }
    throw err;
  }
}

async function handleRotate(req: Request, env: Env, name: string): Promise<Response> {
  const claims = new D1ClaimStore(env.DB);
  const token = bearerFromAuthHeader(req);
  const owner = await claims.findByToken(token);
  if (!owner || !constantTimeEqual(owner.name, name.toLowerCase())) {
    return jsonError(401, 'Unauthorized');
  }
  const next = await claims.rotateToken(owner.name);
  return Response.json({ name: next.name, token: next.token });
}

async function handleRelease(req: Request, env: Env, name: string): Promise<Response> {
  const claims = new D1ClaimStore(env.DB);
  const token = bearerFromAuthHeader(req);
  const owner = await claims.findByToken(token);
  if (!owner || !constantTimeEqual(owner.name, name.toLowerCase())) {
    return jsonError(401, 'Unauthorized');
  }
  await claims.release(owner.name);
  return Response.json({ ok: true });
}

async function handleTickets(req: Request, env: Env): Promise<Response> {
  if (!originAllowed(req, env)) {
    return jsonError(403, 'forbidden origin');
  }
  const body = await readJson<{ hubName?: string }>(req);
  if (!body?.hubName || typeof body.hubName !== 'string') {
    return jsonError(400, 'hubName required');
  }
  const claims = new D1ClaimStore(env.DB);
  if (!(await claims.get(body.hubName))) {
    return jsonError(404, 'Unknown hub');
  }
  const { ticket, expiresAt } = await mintTicket(env.TICKET_SECRET, body.hubName);
  return Response.json({ ticket, expiresAt, iceServers: DEFAULT_ICE_SERVERS });
}

// ─── WebSocket upgrade handlers ─────────────────────────────────────────────

async function handleHubUpgrade(req: Request, env: Env): Promise<Response> {
  const subs = parseSubprotocols(req.headers.get('sec-websocket-protocol'));
  if (!subs.proto?.startsWith('brika.v')) {
    return new Response('Unsupported protocol', { status: 400 });
  }
  const token = subs.bearer ?? '';
  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }
  const claims = new D1ClaimStore(env.DB);
  const owner = await claims.findByToken(token);
  if (!owner || !constantTimeEqual(owner.token, token)) {
    return new Response('Unauthorized', { status: 401 });
  }
  // Pass the *original* Request straight through. Workers' Fetch API strips
  // forbidden headers (Upgrade, Connection, Sec-WebSocket-*) the moment you
  // construct a new Request from one — even via `new Request(url, req)` or
  // `stub.fetch(url, req)`. The DO derives the role from the URL pathname
  // (`/v1/hub` vs `/v1/client`) and re-runs the cheap parts of auth on the
  // info that *does* survive (subprotocol header for hub, query params for
  // client).
  const stub = doStubFor(env, owner.name);
  return stub.fetch(req);
}

async function handleClientUpgrade(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const hubName = url.searchParams.get('hub');
  const ticket = url.searchParams.get('ticket');
  if (!hubName || !ticket) {
    return new Response('hub and ticket required', { status: 400 });
  }
  const claims = await verifyTicket(env.TICKET_SECRET, ticket);
  if (claims?.hub !== hubName) {
    return new Response('Invalid ticket', { status: 401 });
  }
  const store = new D1ClaimStore(env.DB);
  if (!(await store.get(hubName))) {
    return new Response('Unknown hub', { status: 404 });
  }
  // Same pass-through dance as handleHubUpgrade. The DO will read `hub` from
  // the original query and tag the WS as a client of that hub.
  const stub = doStubFor(env, hubName);
  return stub.fetch(req);
}

async function serveUiShell(req: Request, env: Env, url: URL): Promise<Response> {
  const resolved = resolveHubFromUrl(url);
  if (!resolved) {
    // Unknown host/path shape — let the asset binding handle it as normal
    // (404, the marketing page on bare `hub.brika.dev`, etc.).
    return env.ASSETS.fetch(req);
  }

  // Normalise to the asset-binding's view of the world: a request for
  // `<restPath>` on the same origin. The asset binding has a single SPA
  // fallback (`/index.html`) so this works for any sub-path.
  const normalisedUrl = new URL(resolved.restPath + url.search, url.origin);
  const assetReq = new Request(normalisedUrl.toString(), req);
  const assetRes = await env.ASSETS.fetch(assetReq);
  return injectHubMeta(assetRes, resolved.hubName);
}

// ─── Router ─────────────────────────────────────────────────────────────────

export default {
  fetch(req: Request, env: Env): Response | Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    if (path === '/v1/health') {
      return handleHealth(env);
    }
    if (path === '/v1/hubs/claim' && method === 'POST') {
      return handleClaim(req, env);
    }
    const rotateMatch = /^\/v1\/hubs\/([^/]+)\/rotate$/.exec(path);
    if (rotateMatch?.[1] && method === 'POST') {
      return handleRotate(req, env, decodeURIComponent(rotateMatch[1]));
    }
    const statusMatch = /^\/v1\/hubs\/([^/]+)\/status$/.exec(path);
    if (statusMatch?.[1] && method === 'GET') {
      return handleHubStatus(env, decodeURIComponent(statusMatch[1]));
    }
    const releaseMatch = /^\/v1\/hubs\/([^/]+)$/.exec(path);
    if (releaseMatch?.[1] && method === 'DELETE') {
      return handleRelease(req, env, decodeURIComponent(releaseMatch[1]));
    }
    if (path === '/v1/tickets' && method === 'POST') {
      return handleTickets(req, env);
    }
    if (path === '/v1/hub') {
      return handleHubUpgrade(req, env);
    }
    if (path === '/v1/client') {
      return handleClientUpgrade(req, env);
    }
    if (path.startsWith('/v1/')) {
      // Unrecognised /v1/* must not fall through to the static-asset binding.
      return new Response('Not found', { status: 404 });
    }
    // Anything else is a UI request — let the asset binding serve it, but
    // first see whether the (host, path) identifies a hub so we can stamp
    // its name into the document for the bootstrap script.
    return serveUiShell(req, env, url);
  },
} satisfies ExportedHandler<Env>;
