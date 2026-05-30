/**
 * Runtime-neutral per-hub session state machine.
 *
 * Owns:
 *   - At most one hub-side WebSocket (the long-lived signaling connection).
 *   - Zero-or-more client-side WebSockets, one per active browser session.
 *
 * Used by both coordinator transports:
 *   - The Cloudflare `HubSession` Durable Object (one state per DO, scoped to
 *     one hub). The DO supplies an `AttachmentStore` that persists per-socket
 *     metadata via `ws.serializeAttachment` so the state survives hibernation,
 *     and calls `rehydrate` for each tracked socket after a wake.
 *   - The standalone signaling server (one state per hub, kept in a
 *     `Map<hubName, HubSessionState>`). The default `AttachmentStore` is a
 *     process-local `WeakMap` — no persistence needed.
 *
 * The caller wires its runtime's WebSocket events to `handleMessage` /
 * `handleClose`. The state machine never imports a runtime-specific WebSocket
 * type — `WsLike` is the duck-typed minimum.
 */

import { decodeSignaling, encodeSignaling } from './codec';
import type { IceServerProvider } from './ice-provider';
import { translateFromClient, translateFromHub } from './route';
import { DEFAULT_ICE_SERVERS, type IceServer, type SignalingMessage } from './signaling';
import { PROTOCOL_VERSION } from './version';

/** Duck-typed minimum every runtime's WebSocket satisfies. */
export interface WsLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

/**
 * Per-WebSocket metadata. Stored either in a `WeakMap` (standalone) or via
 * `ws.serializeAttachment` (Cloudflare DO, so it survives hibernation).
 */
export type HubSessionAttachment =
  | { role: 'hub'; name: string }
  | {
      role: 'client';
      name: string;
      sessionId: string;
      clientIp?: string;
      clientUserAgent?: string;
    };

/** Pluggable per-socket attachment storage. */
export interface AttachmentStore {
  get(ws: WsLike): HubSessionAttachment | null;
  set(ws: WsLike, attachment: HubSessionAttachment): void;
  delete(ws: WsLike): void;
}

export interface HubSessionStateOptions {
  /** Source of ICE servers sent on `session.iceServers` and `session.offer`. */
  readonly ice: IceServerProvider;
  /** Override per-socket attachment storage. Defaults to a process-local `WeakMap`. */
  readonly attachments?: AttachmentStore;
}

/** Default WeakMap-backed attachment store — fine for any non-hibernating runtime. */
class WeakMapAttachmentStore implements AttachmentStore {
  readonly #map = new WeakMap<WsLike, HubSessionAttachment>();

  get(ws: WsLike): HubSessionAttachment | null {
    return this.#map.get(ws) ?? null;
  }

  set(ws: WsLike, attachment: HubSessionAttachment): void {
    this.#map.set(ws, attachment);
  }

  delete(ws: WsLike): void {
    this.#map.delete(ws);
  }
}

export class HubSessionState {
  readonly #ice: IceServerProvider;
  readonly #attachments: AttachmentStore;
  readonly #clients = new Map<string, WsLike>();
  #hub: WsLike | null = null;

  constructor(opts: HubSessionStateOptions) {
    this.#ice = opts.ice;
    this.#attachments = opts.attachments ?? new WeakMapAttachmentStore();
  }

  /**
   * Re-register a socket whose attachment was previously stored (e.g. after a
   * Cloudflare Durable Object wakes from hibernation). Reads role + sessionId
   * back out of the `AttachmentStore` and re-installs the socket into the
   * appropriate collection. No-op when there's no attachment.
   */
  rehydrate(ws: WsLike): void {
    const att = this.#attachments.get(ws);
    if (!att) {
      return;
    }
    if (att.role === 'hub') {
      this.#hub = ws;
    } else {
      this.#clients.set(att.sessionId, ws);
    }
  }

  /**
   * Attach a freshly-upgraded hub WebSocket. Evicts any prior hub WS with
   * `close(4001, 'replaced')`, then records the attachment so later message
   * handlers can identify the role.
   */
  attachHub(ws: WsLike, name: string): void {
    const prior = this.#hub;
    if (prior && prior !== ws) {
      try {
        prior.close(4001, 'replaced by newer connection');
      } catch {
        // ignore
      }
      this.#attachments.delete(prior);
    }
    this.#hub = ws;
    this.#attachments.set(ws, { role: 'hub', name });
  }

  /**
   * Attach a freshly-upgraded client WebSocket. Allocates a sessionId, sends
   * `session.iceServers`, and returns the id. When no hub is online, sends
   * `session.error{hub-offline}` and closes with `4003` — returns `null` so
   * the caller knows not to wire message handlers.
   */
  async attachClient(
    ws: WsLike,
    ctx: { name: string; clientIp?: string; clientUserAgent?: string }
  ): Promise<string | null> {
    if (!this.#hub) {
      trySend(ws, {
        v: PROTOCOL_VERSION,
        kind: 'session.error',
        code: 'hub-offline',
        message: `Hub "${ctx.name}" is not connected to the coordinator`,
      });
      try {
        ws.close(4003, 'hub offline');
      } catch {
        // ignore
      }
      return null;
    }
    const sessionId = crypto.randomUUID();
    this.#clients.set(sessionId, ws);
    this.#attachments.set(ws, {
      role: 'client',
      name: ctx.name,
      sessionId,
      clientIp: ctx.clientIp,
      clientUserAgent: ctx.clientUserAgent,
    });
    trySend(ws, {
      v: PROTOCOL_VERSION,
      kind: 'session.iceServers',
      iceServers: await this.#ice.iceServers(),
    });
    return sessionId;
  }

  /** Dispatched for every received WS frame on either side. */
  async handleMessage(ws: WsLike, raw: string | ArrayBuffer): Promise<void> {
    const att = this.#attachments.get(ws);
    if (!att) {
      try {
        ws.close(1011, 'lost attachment');
      } catch {
        // ignore
      }
      return;
    }
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    const msg = decodeSignaling(text);
    if (!msg) {
      // Unknown / malformed frame — drop silently for forward-compat.
      return;
    }
    if (att.role === 'hub') {
      this.#routeFromHub(msg);
    } else {
      await this.#routeFromClient(att, msg);
    }
  }

  /** Dispatched on WS close. Tears down dependent sockets when the hub leaves. */
  handleClose(ws: WsLike): void {
    const att = this.#attachments.get(ws);
    if (!att) {
      return;
    }
    this.#attachments.delete(ws);
    if (att.role === 'hub') {
      // Only tear down clients if THIS hub WS was still the active one. A
      // replacement attached via `attachHub` would have set `#hub` to a
      // different ws already, so a stale close from the evicted socket must
      // not wipe the new session's clients.
      if (this.#hub !== ws) {
        return;
      }
      this.#hub = null;
      for (const client of this.#clients.values()) {
        try {
          client.send(
            encodeSignaling({
              v: PROTOCOL_VERSION,
              kind: 'session.error',
              code: 'hub-gone',
              message: 'Hub disconnected',
            })
          );
          client.close(4002, 'hub gone');
        } catch {
          // ignore
        }
      }
      this.#clients.clear();
      return;
    }
    this.#clients.delete(att.sessionId);
  }

  /** Operator-facing snapshot — powers `/v1/hubs/:name/status`. */
  status(): { hubOnline: boolean; activeSessions: number } {
    return { hubOnline: this.#hub !== null, activeSessions: this.#clients.size };
  }

  // ─── internals ──────────────────────────────────────────────────────────

  #routeFromHub(msg: SignalingMessage): void {
    if (msg.kind !== 'hub.answer' && msg.kind !== 'hub.ice' && msg.kind !== 'hub.abort') {
      return;
    }
    const client = this.#clients.get(msg.sessionId);
    if (!client) {
      return;
    }
    try {
      client.send(encodeSignaling(translateFromHub(msg)));
    } catch {
      return;
    }
    if (msg.kind === 'hub.abort') {
      try {
        client.close(4002, 'hub abort');
      } catch {
        // ignore
      }
    }
  }

  async #routeFromClient(
    att: HubSessionAttachment & { role: 'client' },
    msg: SignalingMessage
  ): Promise<void> {
    if (msg.kind !== 'client.offer' && msg.kind !== 'client.ice' && msg.kind !== 'client.abort') {
      return;
    }
    // ICE and abort frames must carry the client's own session id.
    if (msg.kind !== 'client.offer' && msg.sessionId !== att.sessionId) {
      return;
    }
    const hub = this.#hub;
    if (!hub) {
      // hub left between accept and the frame — drop silently
      return;
    }
    // Only `client.offer` carries `iceServers` to the hub; ICE/abort don't,
    // so skipping the provider call there avoids a TURN-cred fetch per trickle.
    const ice: ReadonlyArray<IceServer> =
      msg.kind === 'client.offer' ? await this.#ice.iceServers() : DEFAULT_ICE_SERVERS;
    try {
      hub.send(
        encodeSignaling(
          translateFromClient(msg, att.sessionId, ice, {
            clientIp: att.clientIp,
            clientUserAgent: att.clientUserAgent,
          })
        )
      );
    } catch {
      // ignore
    }
  }
}

function trySend(ws: WsLike, msg: SignalingMessage): void {
  try {
    ws.send(encodeSignaling(msg));
  } catch {
    // ignore — socket may be in a transitional state
  }
}
