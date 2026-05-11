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
  readonly #env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.#state = state;
    this.#env = env;
  }

  /**
   * Called by the Worker after it has authenticated the upgrade and decided
   * which role the socket plays. The Worker passes the attachment in via
   * a `?role=hub&name=...` or `?role=client&name=...&sessionId=...` query.
   */
  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get('upgrade');
    if (upgrade !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const url = new URL(request.url);
    const role = url.searchParams.get('role');
    const name = url.searchParams.get('name') ?? '';
    if (!name) {
      return new Response('name required', { status: 400 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    let attachment: Attachment;
    if (role === 'hub') {
      // Evict any prior hub socket — only one hub WS per name.
      for (const ws of this.#state.getWebSockets('hub')) {
        try {
          ws.close(4001, 'replaced by newer connection');
        } catch {
          // ignore
        }
      }
      attachment = { role: 'hub', name };
      this.#state.acceptWebSocket(server, ['hub']);
    } else if (role === 'client') {
      // Refuse client sockets if no hub is online.
      if (this.#state.getWebSockets('hub').length === 0) {
        server.close(4003, 'hub offline');
        return new Response(null, { status: 101, webSocket: client });
      }
      const sessionId = url.searchParams.get('sessionId') ?? crypto.randomUUID();
      attachment = { role: 'client', name, sessionId };
      this.#state.acceptWebSocket(server, ['client', `session:${sessionId}`]);
      // Push ICE servers to the client as the first frame.
      try {
        server.send(
          JSON.stringify({
            v: PROTOCOL_VERSION,
            kind: 'session.iceServers',
            iceServers: ICE_SERVERS,
          } satisfies SignalingMessage)
        );
      } catch {
        // ignore
      }
    } else {
      return new Response('role must be hub or client', { status: 400 });
    }

    server.serializeAttachment(attachment);

    return new Response(null, { status: 101, webSocket: client });
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

  #routeFromHub(name: string, msg: SignalingMessage): void {
    switch (msg.kind) {
      case 'hub.answer': {
        const client = this.#findClient(msg.sessionId);
        client?.send(
          encodeSignaling({
            v: PROTOCOL_VERSION,
            kind: 'session.answer',
            sessionId: msg.sessionId,
            sdp: msg.sdp,
          })
        );
        return;
      }
      case 'hub.ice': {
        const client = this.#findClient(msg.sessionId);
        client?.send(
          encodeSignaling({
            v: PROTOCOL_VERSION,
            kind: 'session.ice',
            sessionId: msg.sessionId,
            candidate: msg.candidate,
            from: 'hub',
          })
        );
        return;
      }
      case 'hub.abort': {
        const client = this.#findClient(msg.sessionId);
        if (client) {
          client.send(
            encodeSignaling({
              v: PROTOCOL_VERSION,
              kind: 'session.error',
              sessionId: msg.sessionId,
              code: 'hub-abort',
              message: msg.reason ?? 'Hub aborted session',
            })
          );
          client.close(4002, 'hub abort');
        }
        return;
      }
      case 'hub.register':
        // Hubs register implicitly by connecting — nothing to do here.
        return;
      default:
        return;
    }
  }

  #routeFromClient(att: Attachment & { role: 'client' }, msg: SignalingMessage): void {
    switch (msg.kind) {
      case 'client.offer': {
        const hub = this.#state.getWebSockets('hub')[0];
        if (!hub) {
          // hub left between accept and offer
          return;
        }
        hub.send(
          encodeSignaling({
            v: PROTOCOL_VERSION,
            kind: 'session.offer',
            sessionId: att.sessionId,
            sdp: msg.sdp,
            clientCaps: msg.caps,
            iceServers: ICE_SERVERS,
          })
        );
        return;
      }
      case 'client.ice': {
        if (msg.sessionId !== att.sessionId) {
          return;
        }
        const hub = this.#state.getWebSockets('hub')[0];
        hub?.send(
          encodeSignaling({
            v: PROTOCOL_VERSION,
            kind: 'session.ice',
            sessionId: att.sessionId,
            candidate: msg.candidate,
            from: 'client',
          })
        );
        return;
      }
      case 'client.abort': {
        if (msg.sessionId !== att.sessionId) {
          return;
        }
        const hub = this.#state.getWebSockets('hub')[0];
        hub?.send(
          encodeSignaling({
            v: PROTOCOL_VERSION,
            kind: 'session.error',
            sessionId: att.sessionId,
            code: 'client-abort',
            message: msg.reason ?? 'Client aborted',
          })
        );
        return;
      }
      default:
        return;
    }
  }

  #findClient(sessionId: string): WebSocket | undefined {
    return this.#state.getWebSockets(`session:${sessionId}`)[0];
  }
}
