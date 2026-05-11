/**
 * Brika signaling coordinator.
 *
 * Routes:
 *   - GET  /v1/health            liveness probe
 *   - POST /v1/tickets           mint a short-lived ticket bound to a hub name
 *   - WS   /v1/hub               long-lived hub signaling (subprotocols: ['brika.v1','bearer.<token>'])
 *   - WS   /v1/client?hub=...&ticket=...   browser signaling (one-shot per session)
 *
 * The coordinator never sees application traffic — it only brokers WebRTC
 * SDP/ICE between peers. Once the data channel is open, both peers talk
 * directly and this process drops out.
 */

import {
  decodeSignaling,
  type IceServer,
  PROTOCOL_VERSION,
} from '@brika/remote-access-protocol';
import { Registry } from './registry';
import { routeFrame } from './router';
import { mintTicket, verifyTicket } from './tickets';

// ─── Config ────────────────────────────────────────────────────────────────

interface HubTokens {
  /** Map of hub name → expected bearer token. Loaded from env at boot. */
  readonly tokens: ReadonlyMap<string, string>;
}

function loadHubTokens(): HubTokens {
  const raw = process.env.SIGNALING_HUB_TOKENS?.trim() ?? '';
  const tokens = new Map<string, string>();
  if (!raw) {
    return { tokens };
  }
  for (const pair of raw.split(',')) {
    const [name, token] = pair.split(':');
    if (name && token) {
      tokens.set(name.trim(), token.trim());
    }
  }
  return { tokens };
}

function parseIceServers(): ReadonlyArray<IceServer> {
  const custom = process.env.SIGNALING_ICE_SERVERS;
  if (custom) {
    try {
      return JSON.parse(custom) as ReadonlyArray<IceServer>;
    } catch {
      // fall through to defaults
    }
  }
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];
}

function parseSubprotocols(header: string | null): { proto?: string; bearer?: string } {
  if (!header) {
    return {};
  }
  const out: { proto?: string; bearer?: string } = {};
  for (const part of header.split(',')) {
    const trimmed = part.trim();
    if (trimmed.startsWith('brika.v')) {
      out.proto = trimmed;
    } else if (trimmed.startsWith('bearer.')) {
      out.bearer = trimmed.slice('bearer.'.length);
    } else if (trimmed.startsWith('ticket.')) {
      out.bearer = trimmed.slice('ticket.'.length);
    }
  }
  return out;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a.codePointAt(i) ?? 0) ^ (b.codePointAt(i) ?? 0);
  }
  return diff === 0;
}

function authenticateHubToken(token: string, hubTokens: HubTokens): string | null {
  if (!token) {
    return null;
  }
  for (const [name, expected] of hubTokens.tokens) {
    if (constantTimeEqual(token, expected)) {
      return name;
    }
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
const SECRET = process.env.SIGNALING_TICKET_SECRET ?? 'dev-only-secret-change-me';
const HUB_TOKENS = loadHubTokens();
const ICE_SERVERS = parseIceServers();
const registry = new Registry();

// ─── HTTP route handlers ──────────────────────────────────────────────────

async function handleTickets(req: Request): Promise<Response> {
  let body: { hubName?: string };
  try {
    body = (await req.json()) as { hubName?: string };
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.hubName || typeof body.hubName !== 'string') {
    return Response.json({ error: 'hubName required' }, { status: 400 });
  }
  const { ticket, expiresAt } = await mintTicket(SECRET, body.hubName);
  return Response.json({ ticket, expiresAt, iceServers: ICE_SERVERS });
}

function handleHubUpgrade(
  req: Request,
  server: Bun.Server<WSData>
): Response | undefined {
  const subs = parseSubprotocols(req.headers.get('sec-websocket-protocol'));
  if (subs.proto !== `brika.v${PROTOCOL_VERSION}`) {
    return new Response('Unsupported protocol', { status: 400 });
  }
  const name = authenticateHubToken(subs.bearer ?? '', HUB_TOKENS);
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

function onHubFirstMessage(ws: Bun.ServerWebSocket<WSData>, raw: string, expectedName: string): void {
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
      return Response.json({ ok: true, ...registry.stats() });
    }
    if (url.pathname === '/v1/tickets' && req.method === 'POST') {
      return handleTickets(req);
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
console.log(`[signaling] ${HUB_TOKENS.tokens.size} hub token(s) configured`);
