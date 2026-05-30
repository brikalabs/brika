/**
 * Shared Hono router for the brika signaling coordinator.
 *
 * Owns every HTTP and WebSocket route. Runtime-specific concerns (D1 vs
 * SQLite claims; DO-backed sessions vs in-process Map; CF asset binding vs
 * filesystem) are injected via {@link AppDeps}. Per-route pre-checks (origin
 * allowlist, rate limit, bearer-owner auth) come from `app-middleware.ts`.
 */

import {
  type ClaimStore,
  type IceServerProvider,
  mintTicket,
  parseSubprotocols,
  verifyTicket,
} from '@brika/remote-access-protocol';
import { Hono } from 'hono';
import {
  type AppVariables,
  handleClaimErrors,
  originGuard,
  rateLimitGate,
  requireOwnerOf,
} from './app-middleware';
import { injectHubMeta, resolveHubFromUrl } from './hub-resolution';
import type { RateBucket } from './rate-limit';

/**
 * Runtime-specific wiring injected into the shared router. The HTTP routes
 * see only these capabilities — no CF bindings, no Node globals — so the
 * same router runs unchanged on Workers, Bun, Node, and Deno.
 */
export interface AppDeps {
  readonly claims: ClaimStore;
  readonly ice: IceServerProvider;
  readonly ticketSecret: string;
  /** Allowed Origins. Localhost is always trusted; falls back to `hub.brika.dev`. */
  readonly allowedOrigins?: readonly string[];
  /** Static asset Fetcher. CF: `env.ASSETS`. Standalone: a filesystem-backed Fetcher. */
  readonly assets: { fetch(req: Request): Promise<Response> | Response };
  /**
   * Forward a hub WebSocket upgrade to the runtime that owns the session.
   * CF: fetch the DO stub. Standalone: resolve the in-process session.
   */
  hubUpgrade(hubName: string, req: Request): Promise<Response>;
  /** Same, for client WebSocket upgrades. */
  clientUpgrade(hubName: string, req: Request): Promise<Response>;
  /** Operator-facing per-hub liveness snapshot. */
  hubStatus(hubName: string): Promise<{ hubOnline: boolean; activeSessions: number }>;
  /**
   * Optional rate-limit hook. Returning a {@link Response} short-circuits
   * the handler with 429. Standalone uses an in-memory token bucket; CF can
   * no-op when CF's native rate-limit rules are configured upstream.
   */
  rateLimit?(req: Request, bucket: RateBucket): Response | null;
}

export function buildApp(deps: AppDeps): Hono<{ Variables: AppVariables }> {
  const app = new Hono<{ Variables: AppVariables }>();
  const origin = originGuard(deps.allowedOrigins);
  const rateLimit = (bucket: RateBucket) => rateLimitGate(deps.rateLimit, bucket);
  const requireOwner = (param: string) => requireOwnerOf(deps.claims, param);

  app.get('/v1/health', async (c) => c.json({ ok: true, claims: await deps.claims.size() }));

  app.post('/v1/hubs/claim', origin, rateLimit('claim'), async (c) => {
    const body = await c.req.json<{ name?: string }>().catch(() => null);
    if (!body?.name || typeof body.name !== 'string') {
      return c.json({ error: 'name required' }, 400);
    }
    return handleClaimErrors(c, async () => {
      const minted = await deps.claims.claim(body.name as string);
      return c.json({
        name: minted.name,
        token: minted.token,
        recoveryCode: minted.recoveryCode,
        createdAt: minted.createdAt,
      });
    });
  });

  app.get('/v1/hubs/:name/status', async (c) => {
    const lower = c.req.param('name').toLowerCase();
    if (!(await deps.claims.get(lower))) {
      return c.json({ error: 'Unknown hub' }, 404);
    }
    const status = await deps.hubStatus(lower);
    return c.json({ name: lower, ...status });
  });

  app.post('/v1/hubs/:name/rotate', rateLimit('rotate'), requireOwner('name'), async (c) => {
    const owner = c.get('owner');
    const next = await deps.claims.rotateToken(owner.name);
    return c.json({ name: next.name, token: next.token });
  });

  app.delete('/v1/hubs/:name', requireOwner('name'), async (c) => {
    const owner = c.get('owner');
    await deps.claims.release(owner.name);
    return c.json({ ok: true });
  });

  app.post('/v1/hubs/:name/recover', origin, rateLimit('recover'), async (c) => {
    const body = await c.req.json<{ recoveryCode?: string }>().catch(() => null);
    if (!body?.recoveryCode || typeof body.recoveryCode !== 'string') {
      return c.json({ error: 'recoveryCode required' }, 400);
    }
    return handleClaimErrors(c, async () => {
      const minted = await deps.claims.recover(c.req.param('name'), body.recoveryCode as string);
      return c.json({
        name: minted.name,
        token: minted.token,
        recoveryCode: minted.recoveryCode,
        createdAt: minted.createdAt,
      });
    });
  });

  app.post('/v1/hubs/:name/recovery', requireOwner('name'), async (c) => {
    const owner = c.get('owner');
    const recoveryCode = await deps.claims.mintRecoveryCode(owner.name);
    return c.json({ name: owner.name, recoveryCode });
  });

  app.post('/v1/tickets', origin, rateLimit('ticket'), async (c) => {
    const body = await c.req.json<{ hubName?: string }>().catch(() => null);
    if (!body?.hubName || typeof body.hubName !== 'string') {
      return c.json({ error: 'hubName required' }, 400);
    }
    if (!(await deps.claims.get(body.hubName))) {
      return c.json({ error: 'Unknown hub' }, 404);
    }
    const { ticket, expiresAt } = await mintTicket(deps.ticketSecret, body.hubName);
    const iceServers = await deps.ice.iceServers();
    return c.json({ ticket, expiresAt, iceServers });
  });

  // ─── WebSocket upgrade routes ───────────────────────────────────────────

  app.all('/v1/hub', async (c) => {
    const subs = parseSubprotocols(c.req.header('sec-websocket-protocol') ?? null);
    if (!subs.proto?.startsWith('brika.v')) {
      return new Response('Unsupported protocol', { status: 400 });
    }
    const token = subs.bearer ?? '';
    if (!token) {
      return new Response('Unauthorized', { status: 401 });
    }
    const owner = await deps.claims.findByToken(token);
    if (!owner) {
      return new Response('Unauthorized', { status: 401 });
    }
    return await deps.hubUpgrade(owner.name, c.req.raw);
  });

  app.all('/v1/client', origin, async (c) => {
    const hubName = c.req.query('hub');
    const ticket = c.req.query('ticket');
    if (!hubName || !ticket) {
      return new Response('hub and ticket required', { status: 400 });
    }
    const claims = await verifyTicket(deps.ticketSecret, ticket);
    if (claims?.hub !== hubName) {
      return new Response('Invalid ticket', { status: 401 });
    }
    if (!(await deps.claims.get(hubName))) {
      return new Response('Unknown hub', { status: 404 });
    }
    return await deps.clientUpgrade(hubName, c.req.raw);
  });

  // Unrecognised /v1/* must not fall through to the asset binding.
  app.all('/v1/*', (c) => c.json({ error: 'Not found' }, 404));

  // Anything else is a UI request — let the asset binding serve it, but first
  // see whether the (host, path) identifies a hub so we can stamp its name
  // into the document for the bootstrap script.
  app.all('*', async (c) => {
    const url = new URL(c.req.url);
    const resolved = resolveHubFromUrl(url);
    if (!resolved) {
      return await deps.assets.fetch(c.req.raw);
    }
    const normalisedUrl = new URL(resolved.restPath + url.search, url.origin);
    const assetReq = new Request(normalisedUrl.toString(), c.req.raw);
    const assetRes = await deps.assets.fetch(assetReq);
    return injectHubMeta(assetRes, resolved.hubName);
  });

  return app;
}
