/**
 * Signaling message router.
 *
 * Pure function — takes a registry, a peer (hub or client), and an inbound
 * frame, and forwards it appropriately. Decoupled from the WebSocket
 * implementation so it's easy to unit-test.
 */

import {
  decodeSignaling,
  encodeSignaling,
  type IceServer,
  PROTOCOL_VERSION,
  type SignalingMessage,
} from '@brika/remote-access-protocol';
import type { ClientConnection, HubConnection, Registry } from './registry';

/**
 * What we know about the source of an inbound frame. Used to route the
 * frame to the correct counterpart and to apply the right authorization.
 */
export type Peer =
  | { kind: 'hub'; conn: HubConnection }
  | { kind: 'client'; conn: ClientConnection };

export interface RouterDeps {
  readonly registry: Registry;
  readonly iceServers: ReadonlyArray<IceServer>;
}

function send(socket: { send: (data: string) => void }, msg: SignalingMessage): void {
  try {
    socket.send(encodeSignaling(msg));
  } catch {
    // Send may fail if the socket is closing. Drop silently — the close
    // handler will tidy up the registry entry.
  }
}

/**
 * Route a JSON-encoded frame from `peer`. Returns false when the frame is
 * malformed or unauthorized for this peer (so the caller can close the
 * socket).
 */
export function routeFrame(deps: RouterDeps, peer: Peer, raw: string): boolean {
  const msg = decodeSignaling(raw);
  if (!msg) {
    return false;
  }
  return route(deps, peer, msg);
}

function route(deps: RouterDeps, peer: Peer, msg: SignalingMessage): boolean {
  if (peer.kind === 'hub') {
    return routeFromHub(deps, peer.conn, msg);
  }
  return routeFromClient(deps, peer.conn, msg);
}

function routeFromHub(deps: RouterDeps, hub: HubConnection, msg: SignalingMessage): boolean {
  switch (msg.kind) {
    case 'hub.answer': {
      const session = deps.registry.getSession(msg.sessionId);
      if (!session || session.hubName !== hub.name) {
        return true;
      }
      send(session.socket, {
        v: PROTOCOL_VERSION,
        kind: 'session.answer',
        sessionId: msg.sessionId,
        sdp: msg.sdp,
      });
      return true;
    }
    case 'hub.ice': {
      const session = deps.registry.getSession(msg.sessionId);
      if (!session || session.hubName !== hub.name) {
        return true;
      }
      send(session.socket, {
        v: PROTOCOL_VERSION,
        kind: 'session.ice',
        sessionId: msg.sessionId,
        candidate: msg.candidate,
        from: 'hub',
      });
      return true;
    }
    case 'hub.abort': {
      const session = deps.registry.getSession(msg.sessionId);
      if (!session || session.hubName !== hub.name) {
        return true;
      }
      send(session.socket, {
        v: PROTOCOL_VERSION,
        kind: 'session.error',
        sessionId: msg.sessionId,
        code: 'hub-abort',
        message: msg.reason ?? 'Hub aborted session',
      });
      session.socket.close(4002, 'hub abort');
      deps.registry.closeSession(msg.sessionId, hub.socket);
      return true;
    }
    case 'hub.register':
      // Re-registers from the same socket are no-ops.
      return true;
    default:
      // Frames the hub shouldn't be sending — ignore.
      return true;
  }
}

function routeFromClient(
  deps: RouterDeps,
  client: ClientConnection,
  msg: SignalingMessage
): boolean {
  switch (msg.kind) {
    case 'client.offer': {
      const hub = deps.registry.getHub(client.hubName);
      if (!hub) {
        send(client.socket, {
          v: PROTOCOL_VERSION,
          kind: 'session.error',
          sessionId: client.sessionId,
          code: 'hub-offline',
          message: `Hub "${client.hubName}" is not online`,
        });
        return true;
      }
      send(hub.socket, {
        v: PROTOCOL_VERSION,
        kind: 'session.offer',
        sessionId: client.sessionId,
        sdp: msg.sdp,
        clientCaps: msg.caps,
        iceServers: deps.iceServers,
      });
      return true;
    }
    case 'client.ice': {
      // Clients can only emit ICE for their own session id.
      if (msg.sessionId !== client.sessionId) {
        return true;
      }
      const hub = deps.registry.getHub(client.hubName);
      if (!hub) {
        return true;
      }
      send(hub.socket, {
        v: PROTOCOL_VERSION,
        kind: 'session.ice',
        sessionId: client.sessionId,
        candidate: msg.candidate,
        from: 'client',
      });
      return true;
    }
    case 'client.abort': {
      if (msg.sessionId !== client.sessionId) {
        return true;
      }
      const hub = deps.registry.getHub(client.hubName);
      if (hub) {
        send(hub.socket, {
          v: PROTOCOL_VERSION,
          kind: 'session.error',
          sessionId: client.sessionId,
          code: 'client-abort',
          message: msg.reason ?? 'Client aborted',
        });
      }
      deps.registry.closeSession(client.sessionId, client.socket);
      client.socket.close(1000, 'client abort');
      return true;
    }
    default:
      return true;
  }
}
