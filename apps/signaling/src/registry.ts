/**
 * In-process registry for online hubs and active sessions.
 *
 * v0 — single-process, in-memory. v1 will move the registry to Redis (or a
 * Cloudflare Durable Object) so multiple coordinator instances can share state.
 */

import { encodeSignaling, type SignalingMessage } from '@brika/remote-access-protocol';

export interface PeerSocket {
  /** Send a JSON-encoded signaling frame to the peer. */
  send: (data: string) => void;
  /** Close the underlying WebSocket. */
  close: (code?: number, reason?: string) => void;
}

export interface HubConnection {
  readonly name: string;
  readonly socket: PeerSocket;
  /** Set of session ids currently bound to this hub. */
  readonly sessionIds: Set<string>;
}

export interface ClientConnection {
  readonly sessionId: string;
  readonly hubName: string;
  readonly socket: PeerSocket;
}

export class Registry {
  readonly #hubs = new Map<string, HubConnection>();
  readonly #sessions = new Map<string, ClientConnection>();

  // ─── Hub lifecycle ──────────────────────────────────────────────────────

  registerHub(name: string, socket: PeerSocket): HubConnection {
    // If a previous connection is lingering for the same name, evict it.
    const existing = this.#hubs.get(name);
    if (existing) {
      existing.socket.close(4001, 'replaced by newer connection');
    }
    const conn: HubConnection = { name, socket, sessionIds: new Set() };
    this.#hubs.set(name, conn);
    return conn;
  }

  unregisterHub(name: string, socket: PeerSocket): void {
    const conn = this.#hubs.get(name);
    if (conn?.socket !== socket) {
      // Either not present or already replaced — ignore.
      return;
    }
    // Tear down every session bound to this hub.
    for (const sessionId of conn.sessionIds) {
      const client = this.#sessions.get(sessionId);
      if (client) {
        this.#emit(client.socket, {
          v: 1,
          kind: 'session.error',
          sessionId,
          code: 'hub-gone',
          message: 'Hub disconnected',
        });
        client.socket.close(4002, 'hub gone');
        this.#sessions.delete(sessionId);
      }
    }
    this.#hubs.delete(name);
  }

  getHub(name: string): HubConnection | undefined {
    return this.#hubs.get(name);
  }

  // ─── Session lifecycle ──────────────────────────────────────────────────

  openSession(hubName: string, socket: PeerSocket): ClientConnection | null {
    const hub = this.#hubs.get(hubName);
    if (!hub) {
      return null;
    }
    const sessionId = crypto.randomUUID();
    const conn: ClientConnection = { sessionId, hubName, socket };
    this.#sessions.set(sessionId, conn);
    hub.sessionIds.add(sessionId);
    return conn;
  }

  closeSession(sessionId: string, originatorSocket?: PeerSocket): void {
    const conn = this.#sessions.get(sessionId);
    if (!conn) {
      return;
    }
    if (originatorSocket && conn.socket !== originatorSocket) {
      // The hub is closing a session it owns — only let it through if it's
      // bound to a hub connection that owns the sessionId.
      const hub = this.#hubs.get(conn.hubName);
      if (hub?.socket !== originatorSocket) {
        return;
      }
    }
    this.#sessions.delete(sessionId);
    const hub = this.#hubs.get(conn.hubName);
    hub?.sessionIds.delete(sessionId);
  }

  getSession(sessionId: string): ClientConnection | undefined {
    return this.#sessions.get(sessionId);
  }

  /** Snapshot for diagnostics. */
  stats(): { hubs: number; sessions: number; hubNames: ReadonlyArray<string> } {
    return {
      hubs: this.#hubs.size,
      sessions: this.#sessions.size,
      hubNames: [...this.#hubs.keys()],
    };
  }

  #emit(socket: PeerSocket, msg: SignalingMessage): void {
    try {
      socket.send(encodeSignaling(msg));
    } catch {
      // Socket may have died mid-flight — ignore.
    }
  }
}
