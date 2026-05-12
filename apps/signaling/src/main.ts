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
  type IceServer,
  PROTOCOL_VERSION,
  parseSubprotocols,
} from '@brika/remote-access-protocol';
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

async function handleTickets(req: Request): Promise<Response> {
  if (!originAllowed(req)) {
    return Response.json({ error: 'forbidden origin' }, { status: 403 });
  }
  let body: { hubName?: string };
  try {
    body = (await req.json()) as { hubName?: string };
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.hubName || typeof body.hubName !== 'string') {
    return Response.json({ error: 'hubName required' }, { status: 400 });
  }
  // Tickets are useless without a hub to connect to — refuse to mint for
  // unknown names so we don't waste the browser's time.
  if (!claims.get(body.hubName.toLowerCase())) {
    return Response.json({ error: 'Unknown hub' }, { status: 404 });
  }
  const { ticket, expiresAt } = await mintTicket(SECRET, body.hubName);
  return Response.json({ ticket, expiresAt, iceServers: ICE_SERVERS });
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

async function handleClaim(req: Request): Promise<Response> {
  if (!originAllowed(req)) {
    return Response.json({ error: 'forbidden origin' }, { status: 403 });
  }
  let body: { name?: string };
  try {
    body = (await req.json()) as { name?: string };
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.name || typeof body.name !== 'string') {
    return Response.json({ error: 'name required' }, { status: 400 });
  }
  try {
    const claim = await claims.claim(body.name);
    return Response.json({
      name: claim.name,
      token: claim.token,
      createdAt: claim.createdAt,
    });
  } catch (err) {
    if (err instanceof ClaimError) {
      return Response.json(
        { error: err.message, code: err.code },
        { status: claimErrorStatus(err.code) }
      );
    }
    throw err;
  }
}

function bearerFromAuthHeader(req: Request): string {
  const auth = req.headers.get('authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
}

async function handleRotate(req: Request, name: string): Promise<Response> {
  const token = bearerFromAuthHeader(req);
  const auth = authenticateHubToken(token, claims);
  if (auth !== name.toLowerCase()) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const next = await claims.rotateToken(auth);
  return Response.json({ name: next.name, token: next.token });
}

async function handleRelease(req: Request, name: string): Promise<Response> {
  const token = bearerFromAuthHeader(req);
  const auth = authenticateHubToken(token, claims);
  if (auth !== name.toLowerCase()) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await claims.release(auth);
  // If the hub is currently connected, drop it.
  const hub = registry.getHub(auth);
  hub?.socket.close(4006, 'claim released');
  return Response.json({ ok: true });
}

function handleHubUpgrade(req: Request, server: Bun.Server<WSData>): Response | undefined {
  const subs = parseSubprotocols(req.headers.get('sec-websocket-protocol'));
  if (subs.proto !== `brika.v${PROTOCOL_VERSION}`) {
    return new Response('Unsupported protocol', { status: 400 });
  }
  const name = authenticateHubToken(subs.bearer ?? '', claims);
  if (!name) {
    return new Response('Unauthorized', { status: 401 });
  }
  const ok = server.upgrade(req, {
    data: { role: 'hub.pending', expectedName: name } satisfies WSData,
  });
  return ok ? undefined : new Response('Upgrade failed', { status: 426 });
}

async function handleClientUpgrade(
  req: Request,
  server: Bun.Server<WSData>
): Promise<Response | undefined> {
  const url = new URL(req.url);
  const hubName = url.searchParams.get('hub');
  const ticket = url.searchParams.get('ticket');
  if (!hubName || !ticket) {
    return new Response('hub and ticket required', { status: 400 });
  }
  const claims = await verifyTicket(SECRET, ticket);
  if (claims?.hub !== hubName) {
    return new Response('Invalid ticket', { status: 401 });
  }
  if (!registry.getHub(hubName)) {
    return new Response('Hub offline', { status: 503 });
  }
  const ok = server.upgrade(req, {
    data: { role: 'client', sessionId: '', hubName, socket: null } satisfies WSData,
  });
  return ok ? undefined : new Response('Upgrade failed', { status: 426 });
}

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
  fetch: (req, srv) => {
    const url = new URL(req.url);
    if (url.pathname === '/v1/health') {
      return Response.json({ ok: true, claims: claims.size(), ...registry.stats() });
    }
    if (url.pathname === '/v1/tickets' && req.method === 'POST') {
      return handleTickets(req);
    }
    if (url.pathname === '/v1/hubs/claim' && req.method === 'POST') {
      return handleClaim(req);
    }
    const rotateMatch = /^\/v1\/hubs\/([^/]+)\/rotate$/.exec(url.pathname);
    if (rotateMatch && req.method === 'POST') {
      return handleRotate(req, decodeURIComponent(rotateMatch[1] as string));
    }
    const releaseMatch = /^\/v1\/hubs\/([^/]+)$/.exec(url.pathname);
    if (releaseMatch && req.method === 'DELETE') {
      return handleRelease(req, decodeURIComponent(releaseMatch[1] as string));
    }
    if (url.pathname === '/v1/hub') {
      return handleHubUpgrade(req, srv);
    }
    if (url.pathname === '/v1/client') {
      return handleClientUpgrade(req, srv);
    }
    return new Response('Not found', { status: 404 });
  },
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
