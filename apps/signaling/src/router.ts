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
  translateFromClient,
  translateFromHub,
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
 * Route a JSON-encoded frame from `peer`. Malformed frames are dropped.
 * Authorization/ownership checks happen inside the per-peer routers.
 */
export function routeFrame(deps: RouterDeps, peer: Peer, raw: string): void {
  const msg = decodeSignaling(raw);
  if (!msg) {
    return;
  }
  if (peer.kind === 'hub') {
    routeFromHub(deps, peer.conn, msg);
    return;
  }
  routeFromClient(deps, peer.conn, msg);
}

function routeFromHub(deps: RouterDeps, hub: HubConnection, msg: SignalingMessage): void {
  if (msg.kind !== 'hub.answer' && msg.kind !== 'hub.ice' && msg.kind !== 'hub.abort') {
    // Re-registers from the same socket, and frames the hub shouldn't be
    // sending, are both no-ops.
    return;
  }
  const session = deps.registry.getSession(msg.sessionId);
  if (session?.hubName !== hub.name) {
    return;
  }
  send(session.socket, translateFromHub(msg));
  if (msg.kind === 'hub.abort') {
    session.socket.close(4002, 'hub abort');
    deps.registry.closeSession(msg.sessionId, hub.socket);
  }
}

function routeFromClient(deps: RouterDeps, client: ClientConnection, msg: SignalingMessage): void {
  if (msg.kind !== 'client.offer' && msg.kind !== 'client.ice' && msg.kind !== 'client.abort') {
    return;
  }
  // ICE and abort frames must carry the client's own session id.
  if (msg.kind !== 'client.offer' && msg.sessionId !== client.sessionId) {
    return;
  }
  const hub = deps.registry.getHub(client.hubName);
  if (!hub) {
    // Only `client.offer` gets a 'hub-offline' courtesy reply; ice/abort are
    // best-effort fire-and-forget.
    if (msg.kind === 'client.offer') {
      send(client.socket, {
        v: PROTOCOL_VERSION,
        kind: 'session.error',
        sessionId: client.sessionId,
        code: 'hub-offline',
        message: `Hub "${client.hubName}" is not online`,
      });
    }
    if (msg.kind === 'client.abort') {
      deps.registry.closeSession(client.sessionId, client.socket);
      client.socket.close(1000, 'client abort');
    }
    return;
  }
  send(hub.socket, translateFromClient(msg, client.sessionId, deps.iceServers));
  if (msg.kind === 'client.abort') {
    deps.registry.closeSession(client.sessionId, client.socket);
    client.socket.close(1000, 'client abort');
  }
}
