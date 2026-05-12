/**
 * HubSession Durable Object — one instance per hub name.
 *
 * Owns:
 *   - At most one hub-side WebSocket (the long-lived signaling connection).
 *   - Zero-or-more client-side WebSockets, one per active browser session.
 *
 * Uses the WebSocket Hibernation API (`acceptWebSocket` + `webSocketMessage`
 * handlers on the DO class) so the DO can sleep between frames without
 * burning CPU time. The `serializeAttachment` value on each WebSocket tags it
 * as `hub` or `client` and stores the sessionId — this survives hibernation.
 *
 * The DO sits behind the Worker's `fetch` entrypoint; the Worker performs
 * authentication and then forwards the upgrade request here via
 * `state.acceptWebSocket(server)` against this DO's stub.
 */

import {
  decodeSignaling,
  encodeSignaling,
  type IceServer,
  PROTOCOL_VERSION,
  type SignalingMessage,
  translateFromClient,
  translateFromHub,
} from '@brika/remote-access-protocol';

const ICE_SERVERS: ReadonlyArray<IceServer> = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/**
 * Per-WebSocket attachment so the DO knows what role each socket plays after
 * hibernation. Stored via `ws.serializeAttachment(...)` at accept time.
 */
type Attachment =
  | { role: 'hub'; name: string }
  | { role: 'client'; name: string; sessionId: string };

export interface Env {
  HUB_SESSION: DurableObjectNamespace;
  DB: D1Database;
  TICKET_SECRET?: string;
}

export class HubSession {
  readonly #state: DurableObjectState;

  constructor(state: DurableObjectState, _env: Env) {
    this.#state = state;
  }

  /**
   * Called by the Worker after it has authenticated the upgrade. The Worker
   * cannot reliably pass synthetic params via headers or a rebuilt URL —
   * Workers' Fetch API strips WebSocket-related forbidden headers from any
   * reconstructed Request. So we receive the *original* request and derive
   * the role from `url.pathname`:
   *
   *   `/v1/hub`    → this is the hub-side socket (one per name)
   *   `/v1/client` → this is a browser session
   *
   * The hub name comes from the URL the Worker forwarded us (the DO id was
   * already chosen by the Worker via `idFromName(hubName)`, so the name
   * here is informational; we capture it on the attachment for logs).
   */
  fetch(request: Request): Response {
    const url = new URL(request.url);

    // Operator-facing introspection — non-WebSocket, returns whether this DO
    // currently has a live hub WebSocket and how many client sessions are
    // attached. Routed by the Worker via `GET /v1/hubs/<name>/status`.
    if (url.pathname === '/internal/status') {
      return Response.json({
        name: url.searchParams.get('name') ?? '',
        hubOnline: this.#state.getWebSockets('hub').length > 0,
        activeSessions: this.#state.getWebSockets('client').length,
      });
    }

    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    // Negotiate the subprotocol. Browsers (and our hub-side WS client) send
    // `Sec-WebSocket-Protocol: brika.v1[, bearer.<token>]`. RFC 6455 requires
    // the server to echo back exactly one of the offered protocols (or none),
    // and the browser fails the handshake if we omit it. We just pick the
    // first `brika.v*` offer.
    const offered = request.headers.get('sec-websocket-protocol') ?? '';
    const acceptedProtocol = offered
      .split(',')
      .map((s) => s.trim())
      .find((s) => s.startsWith('brika.v'));

    if (url.pathname === '/v1/hub') {
      return this.#acceptHub(this.#nameFromBearer(request) ?? '', acceptedProtocol);
    }
    if (url.pathname === '/v1/client') {
      return this.#acceptClient(url.searchParams.get('hub') ?? '', acceptedProtocol);
    }
    return new Response('Unknown upgrade endpoint', { status: 404 });
  }

  // ─── Accept paths ──────────────────────────────────────────────────────

  #acceptHub(hubName: string, protocol: string | undefined): Response {
    if (!hubName) {
      return new Response('name required', { status: 400 });
    }
    const { client, server } = this.#newPair();

    // Evict any prior hub socket — only one hub WS per name.
    for (const ws of this.#state.getWebSockets('hub')) {
      try {
        ws.close(4001, 'replaced by newer connection');
      } catch {
        // ignore
      }
    }
    this.#state.acceptWebSocket(server, ['hub']);
    server.serializeAttachment({ role: 'hub', name: hubName } satisfies Attachment);
    return this.#upgradeResponse(client, protocol);
  }

  #acceptClient(hubName: string, protocol: string | undefined): Response {
    if (!hubName) {
      return new Response('name required', { status: 400 });
    }
    const { client, server } = this.#newPair();

    // Hub offline → accept then close so the browser sees a clean 4003
    // rather than a generic handshake failure.
    if (this.#state.getWebSockets('hub').length === 0) {
      this.#state.acceptWebSocket(server, ['client']);
      this.#trySend(server, {
        v: PROTOCOL_VERSION,
        kind: 'session.error',
        code: 'hub-offline',
        message: `Hub "${hubName}" is not connected to the coordinator`,
      });
      server.close(4003, 'hub offline');
      return this.#upgradeResponse(client, protocol);
    }

    const sessionId = crypto.randomUUID();
    this.#state.acceptWebSocket(server, ['client', `session:${sessionId}`]);
    server.serializeAttachment({
      role: 'client',
      name: hubName,
      sessionId,
    } satisfies Attachment);
    this.#trySend(server, {
      v: PROTOCOL_VERSION,
      kind: 'session.iceServers',
      iceServers: ICE_SERVERS,
    });
    return this.#upgradeResponse(client, protocol);
  }

  #upgradeResponse(client: WebSocket, protocol: string | undefined): Response {
    const headers = new Headers();
    if (protocol) {
      headers.set('Sec-WebSocket-Protocol', protocol);
    }
    return new Response(null, { status: 101, webSocket: client, headers });
  }

  #newPair(): { client: WebSocket; server: WebSocket } {
    const pair = new WebSocketPair();
    return { client: pair[0], server: pair[1] };
  }

  #trySend(ws: WebSocket, msg: SignalingMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // ignore — socket may be in a transitional state
    }
  }

  /**
   * Pull the hub name out of the bearer subprotocol on a hub upgrade. The
   * Worker has already validated the token; here we just need a label for
   * the attachment.
   */
  #nameFromBearer(request: Request): string | null {
    const proto = request.headers.get('sec-websocket-protocol') ?? '';
    for (const part of proto.split(',')) {
      const trimmed = part.trim();
      if (trimmed.startsWith('bearer.')) {
        // Token is opaque; the Worker has already mapped it to a name and
        // routed us to the right DO id. We can't resolve it back to a name
        // here without a D1 round-trip — return a placeholder that the WS
        // accept path is happy with (we never actually use the name in the
        // hub flow beyond logging).
        return 'hub';
      }
    }
    return null;
  }

  /** Hibernation-API entry point: dispatched for every received WS frame. */
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (!attachment) {
      ws.close(1011, 'lost attachment');
      return;
    }
    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);
    const msg = decodeSignaling(raw);
    if (!msg) {
      // Bad frame — drop silently, don't close (peer may be a future version
      // sending a kind we don't recognize; tolerating unknown kinds is part
      // of forward-compat).
      return;
    }
    if (attachment.role === 'hub') {
      this.#routeFromHub(attachment.name, msg);
    } else {
      this.#routeFromClient(attachment, msg);
    }
  }

  webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (!attachment) {
      return;
    }
    if (attachment.role === 'hub') {
      // Gate the client teardown on "no replacement hub WS is attached".
      // `#acceptHub` evicts the prior hub socket with `close(4001)` and
      // synchronously accepts the new one — Cloudflare then dispatches this
      // `webSocketClose` for the OLD ws after the NEW one is already tagged
      // 'hub'. Per the Hibernation API, the closing ws is excluded from
      // `getWebSockets()` results inside `webSocketClose`, so `length === 0`
      // means "no replacement". The Bun coordinator's `unregisterHub`
      // (apps/signaling/src/registry.ts) has the equivalent socket-identity
      // guard.
      if (this.#state.getWebSockets('hub').length > 0) {
        return;
      }
      // Tear down every client session attached to this hub.
      for (const client of this.#state.getWebSockets('client')) {
        try {
          client.send(
            JSON.stringify({
              v: PROTOCOL_VERSION,
              kind: 'session.error',
              code: 'hub-gone',
              message: 'Hub disconnected',
            } satisfies SignalingMessage)
          );
          client.close(4002, 'hub gone');
        } catch {
          // ignore
        }
      }
    }
    // Nothing else to do for client closes — the hub-side abort handler
    // (if any) and the DO's own bookkeeping take care of it.
  }

  webSocketError(_ws: WebSocket, _error: unknown): void {
    // Treated the same as a close.
  }

  // ─── Routing helpers ────────────────────────────────────────────────────

  #routeFromHub(_name: string, msg: SignalingMessage): void {
    if (msg.kind !== 'hub.answer' && msg.kind !== 'hub.ice' && msg.kind !== 'hub.abort') {
      // `hub.register` is implicit on connect; unknown kinds are no-ops.
      return;
    }
    const client = this.#findClient(msg.sessionId);
    if (!client) {
      return;
    }
    client.send(encodeSignaling(translateFromHub(msg)));
    if (msg.kind === 'hub.abort') {
      client.close(4002, 'hub abort');
    }
  }

  #routeFromClient(att: Attachment & { role: 'client' }, msg: SignalingMessage): void {
    if (msg.kind !== 'client.offer' && msg.kind !== 'client.ice' && msg.kind !== 'client.abort') {
      return;
    }
    // ICE and abort frames must carry the client's own session id.
    if (msg.kind !== 'client.offer' && msg.sessionId !== att.sessionId) {
      return;
    }
    const hub = this.#state.getWebSockets('hub')[0];
    if (!hub) {
      // hub left between accept and the frame — drop silently
      return;
    }
    hub.send(encodeSignaling(translateFromClient(msg, att.sessionId, ICE_SERVERS)));
  }

  #findClient(sessionId: string): WebSocket | undefined {
    return this.#state.getWebSockets(`session:${sessionId}`)[0];
  }
}
