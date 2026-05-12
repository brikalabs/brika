/**
 * Brika signaling coordinator.
 *
 * Routes:
 *   - GET    /v1/health                liveness probe
 *   - POST   /v1/hubs/claim            first-come-first-serve name claim, returns bearer token
 *   - POST   /v1/hubs/:name/rotate     rotate the bearer token (requires current token)
 *   - DELETE /v1/hubs/:name            release a claim (requires current token)
 *   - POST   /v1/tickets               mint a short-lived ticket bound to a hub name
 *   - WS     /v1/hub                   long-lived hub signaling (subprotocols: ['brika.v1','bearer.<token>'])
 *   - WS     /v1/client?hub=...&ticket=...   browser signaling (one-shot per session)
 *
 * The coordinator never sees application traffic — it only brokers WebRTC
 * SDP/ICE between peers. Once the data channel is open, both peers talk
 * directly and this process drops out.
 */

import {
  constantTimeEqual,
  DEFAULT_ICE_SERVERS,
  decodeSignaling,
  fetchCloudflareIceServers,
  type IceServer,
  PROTOCOL_VERSION,
  parseSubprotocols,
} from '@brika/remote-access-protocol';
import { Hono } from 'hono';
import { ClaimError, ClaimStore } from './claims';
import { Registry } from './registry';
import { routeFrame } from './router';
import { mintTicket, verifyTicket } from './tickets';

function parseIceServers(): ReadonlyArray<IceServer> {
  const custom = process.env.SIGNALING_ICE_SERVERS;
  if (custom) {
    try {
      return JSON.parse(custom) as ReadonlyArray<IceServer>;
    } catch {
      // fall through to defaults
    }
  }
  return DEFAULT_ICE_SERVERS;
}

/**
 * Look up a claim by bearer token.
 *
 * The indexed lookup itself is not constant-time (Map.get is). We rely on
 * token entropy (256-bit random base64url) for resistance against probing;
 * `constantTimeEqual` only guards against second-preimage timing once a
 * candidate is found.
 */
function authenticateHubToken(token: string, store: ClaimStore): string | null {
  if (!token) {
    return null;
  }
  const candidate = store.findByToken(token);
  if (candidate && constantTimeEqual(token, candidate.token)) {
    return candidate.name;
  }
  return null;
}

// ─── WebSocket data shape ──────────────────────────────────────────────────

interface PeerSocketRef {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
}

type WSData =
  | { role: 'hub.pending'; expectedName: string }
  | { role: 'hub'; name: string; socket: PeerSocketRef }
  | { role: 'client'; sessionId: string; hubName: string; socket: PeerSocketRef | null };

// ─── Boot ─────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? '8787');
const DEV_DEFAULT_SECRET = 'dev-only-secret-change-me';
const SECRET = resolveTicketSecret();
const CLAIMS_PATH = process.env.SIGNALING_CLAIMS_PATH ?? './.signaling-claims.json';
const ICE_SERVERS = parseIceServers();
const ALLOWED_ORIGINS = parseAllowedOrigins();

function resolveTicketSecret(): string {
  const fromEnv = process.env.SIGNALING_TICKET_SECRET;
  if (fromEnv) {
    return fromEnv;
  }
  // Refuse to start with the default secret unless explicitly opted into dev
  // mode. The default is well-known; any production deployment that forgot to
  // set the secret would mint forgeable tickets for every claimed hub.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SIGNALING_TICKET_SECRET is required in production (set it to a 32+ byte secret)'
    );
  }
  return DEV_DEFAULT_SECRET;
}

function parseAllowedOrigins(): readonly string[] | null {
  const raw = process.env.SIGNALING_ALLOWED_ORIGINS;
  if (!raw) {
    return null; // null = accept any Origin (dev default)
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * CSRF defense for state-changing browser endpoints. Returns true when the
 * request is allowed:
 *   - Origin header absent → CLI / server-to-server caller; allowed.
 *   - Origin header set    → must appear in SIGNALING_ALLOWED_ORIGINS (or any
 *                            when unset, for dev).
 */
function originAllowed(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) {
    return true;
  }
  if (ALLOWED_ORIGINS === null) {
    return true;
  }
  return ALLOWED_ORIGINS.includes(origin);
}
const registry = new Registry();
const claims = new ClaimStore(CLAIMS_PATH);
await claims.load();

// ─── HTTP route handlers ──────────────────────────────────────────────────

/**
 * STUN + a fresh Cloudflare Realtime TURN credential pair (when configured
 * via `CF_REALTIME_APP_ID` / `CF_REALTIME_APP_TOKEN`). Soft-fails to the
 * static `ICE_SERVERS` list when CF is unset or unreachable.
 */
async function mergedIceServers(): Promise<ReadonlyArray<IceServer>> {
  const turn = await fetchCloudflareIceServers({
    appId: process.env.CF_REALTIME_APP_ID ?? '',
    token: process.env.CF_REALTIME_APP_TOKEN ?? '',
  });
  return turn.length > 0 ? [...ICE_SERVERS, ...turn] : ICE_SERVERS;
}

function claimErrorStatus(code: ClaimError['code']): 400 | 401 | 403 | 404 | 409 {
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

function bearerFromAuthHeader(req: Request): string {
  const auth = req.headers.get('authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
}

// ─── App ──────────────────────────────────────────────────────────────────
//
// Hono is the router. The second arg of `app.fetch` is the Bindings env;
// we pass the Bun server through so WS-upgrade routes can call
// `c.env.upgrade(c.req.raw, { data })`. Same router family as the CF Worker
// coordinator and the in-process hub API — uniform across the stack.

const app = new Hono<{ Bindings: Bun.Server<WSData> }>();

app.get('/v1/health', (c) => c.json({ ok: true, claims: claims.size(), ...registry.stats() }));

app.post('/v1/tickets', async (c) => {
  if (!originAllowed(c.req.raw)) {
    return c.json({ error: 'forbidden origin' }, 403);
  }
  const body = await c.req.json<{ hubName?: string }>().catch(() => null);
  if (!body?.hubName || typeof body.hubName !== 'string') {
    return c.json({ error: 'hubName required' }, 400);
  }
  if (!claims.get(body.hubName.toLowerCase())) {
    return c.json({ error: 'Unknown hub' }, 404);
  }
  const { ticket, expiresAt } = await mintTicket(SECRET, body.hubName);
  const iceServers = await mergedIceServers();
  return c.json({ ticket, expiresAt, iceServers });
});

app.post('/v1/hubs/claim', async (c) => {
  if (!originAllowed(c.req.raw)) {
    return c.json({ error: 'forbidden origin' }, 403);
  }
  const body = await c.req.json<{ name?: string }>().catch(() => null);
  if (!body?.name || typeof body.name !== 'string') {
    return c.json({ error: 'name required' }, 400);
  }
  try {
    const claim = await claims.claim(body.name);
    return c.json({ name: claim.name, token: claim.token, createdAt: claim.createdAt });
  } catch (err) {
    if (err instanceof ClaimError) {
      return c.json({ error: err.message, code: err.code }, claimErrorStatus(err.code));
    }
    throw err;
  }
});

app.post('/v1/hubs/:name/rotate', async (c) => {
  const token = bearerFromAuthHeader(c.req.raw);
  const auth = authenticateHubToken(token, claims);
  if (auth !== c.req.param('name').toLowerCase()) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const next = await claims.rotateToken(auth);
  return c.json({ name: next.name, token: next.token });
});

app.delete('/v1/hubs/:name', async (c) => {
  const token = bearerFromAuthHeader(c.req.raw);
  const auth = authenticateHubToken(token, claims);
  if (auth !== c.req.param('name').toLowerCase()) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await claims.release(auth);
  // If the hub is currently connected, drop it.
  registry.getHub(auth)?.socket.close(4006, 'claim released');
  return c.json({ ok: true });
});

// ─── WebSocket upgrade routes ──────────────────────────────────────────────

app.all('/v1/hub', (c) => {
  const subs = parseSubprotocols(c.req.header('sec-websocket-protocol') ?? null);
  if (subs.proto !== `brika.v${PROTOCOL_VERSION}`) {
    return c.text('Unsupported protocol', 400);
  }
  const name = authenticateHubToken(subs.bearer ?? '', claims);
  if (!name) {
    return c.text('Unauthorized', 401);
  }
  const ok = c.env.upgrade(c.req.raw, {
    data: { role: 'hub.pending', expectedName: name } satisfies WSData,
  });
  return ok ? c.body(null) : c.text('Upgrade failed', 426);
});

app.all('/v1/client', async (c) => {
  const hubName = c.req.query('hub');
  const ticket = c.req.query('ticket');
  if (!hubName || !ticket) {
    return c.text('hub and ticket required', 400);
  }
  const verified = await verifyTicket(SECRET, ticket);
  if (verified?.hub !== hubName) {
    return c.text('Invalid ticket', 401);
  }
  if (!registry.getHub(hubName)) {
    return c.text('Hub offline', 503);
  }
  const ok = c.env.upgrade(c.req.raw, {
    data: { role: 'client', sessionId: '', hubName, socket: null } satisfies WSData,
  });
  return ok ? c.body(null) : c.text('Upgrade failed', 426);
});

app.all('*', (c) => c.text('Not found', 404));

// ─── WebSocket message handlers ───────────────────────────────────────────

function onClientOpen(ws: Bun.ServerWebSocket<WSData>): void {
  const data = ws.data;
  if (data.role !== 'client') {
    return;
  }
  const socket: PeerSocketRef = {
    send: (msg) => ws.send(msg),
    close: (code, reason) => ws.close(code, reason),
  };
  const conn = registry.openSession(data.hubName, socket);
  if (!conn) {
    socket.send(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        kind: 'session.error',
        code: 'hub-offline',
        message: `Hub "${data.hubName}" went offline`,
      })
    );
    socket.close(4003, 'hub offline');
    return;
  }
  ws.data = { role: 'client', sessionId: conn.sessionId, hubName: data.hubName, socket };
  socket.send(
    JSON.stringify({
      v: PROTOCOL_VERSION,
      kind: 'session.iceServers',
      iceServers: ICE_SERVERS,
    })
  );
}

function onHubFirstMessage(
  ws: Bun.ServerWebSocket<WSData>,
  raw: string,
  expectedName: string
): void {
  const msg = decodeSignaling(raw);
  if (msg?.kind !== 'hub.register') {
    ws.close(4001, 'expected hub.register');
    return;
  }
  if (msg.name !== expectedName) {
    ws.close(4001, 'name mismatch');
    return;
  }
  const socket: PeerSocketRef = {
    send: (out) => ws.send(out),
    close: (code, reason) => ws.close(code, reason),
  };
  const conn = registry.registerHub(msg.name, socket);
  ws.data = { role: 'hub', name: conn.name, socket };
}

function onHubMessage(ws: Bun.ServerWebSocket<WSData>, raw: string, name: string): void {
  const hub = registry.getHub(name);
  if (!hub) {
    ws.close(4004, 'hub not registered');
    return;
  }
  routeFrame({ registry, iceServers: ICE_SERVERS }, { kind: 'hub', conn: hub }, raw);
}

function onClientMessage(ws: Bun.ServerWebSocket<WSData>, raw: string, sessionId: string): void {
  const session = registry.getSession(sessionId);
  if (!session) {
    ws.close(4005, 'session ended');
    return;
  }
  routeFrame({ registry, iceServers: ICE_SERVERS }, { kind: 'client', conn: session }, raw);
}

function onClose(ws: Bun.ServerWebSocket<WSData>): void {
  const data = ws.data;
  if (data.role === 'hub') {
    registry.unregisterHub(data.name, data.socket);
  } else if (data.role === 'client' && data.sessionId && data.socket) {
    registry.closeSession(data.sessionId, data.socket);
  }
}

// ─── Server ───────────────────────────────────────────────────────────────

const server = Bun.serve<WSData>({
  port: PORT,
  fetch: (req, srv) => app.fetch(req, srv),
  websocket: {
    open(ws) {
      onClientOpen(ws);
    },
    message(ws, message) {
      const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);
      const data = ws.data;
      if (data.role === 'hub.pending') {
        onHubFirstMessage(ws, raw, data.expectedName);
      } else if (data.role === 'hub') {
        onHubMessage(ws, raw, data.name);
      } else if (data.role === 'client') {
        onClientMessage(ws, raw, data.sessionId);
      }
    },
    close(ws) {
      onClose(ws);
    },
  },
});

console.log(`[signaling] listening on http://localhost:${server.port}`);
console.log(`[signaling] ${claims.size()} hub claim(s) loaded from ${CLAIMS_PATH}`);
