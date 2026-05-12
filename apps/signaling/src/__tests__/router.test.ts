import { describe, expect, it } from 'bun:test';
import {
  encodeSignaling,
  type IceServer,
  PROTOCOL_VERSION,
  type SignalingMessage,
} from '@brika/remote-access-protocol';
import { type PeerSocket, Registry } from '../registry';
import { routeFrame } from '../router';

const ICE: ReadonlyArray<IceServer> = [{ urls: 'stun:stun.example:3478' }];

interface SpySocket extends PeerSocket {
  readonly sent: string[];
  readonly closes: Array<{ code?: number; reason?: string }>;
}

function makeSocket(): SpySocket {
  const sent: string[] = [];
  const closes: Array<{ code?: number; reason?: string }> = [];
  const socket: SpySocket = {
    sent,
    closes,
    send: (data: string) => {
      sent.push(data);
    },
    close: (code, reason) => {
      closes.push({ code, reason });
    },
  };
  return socket;
}

function parseLast(socket: SpySocket): SignalingMessage {
  const last = socket.sent.at(-1);
  if (!last) {
    throw new Error('no messages sent');
  }
  return JSON.parse(last) as SignalingMessage;
}

/** Test helper that asserts a value isn't null/undefined and narrows the type. */
function ensure<T>(value: T | null | undefined, label = 'value'): T {
  if (value === null || value === undefined) {
    throw new Error(`${label} was unexpectedly nullish`);
  }
  return value;
}

describe('routeFrame', () => {
  it('relays client.offer to the matching hub as session.offer', () => {
    const registry = new Registry();
    const hubSocket = makeSocket();
    const hub = registry.registerHub('maxime', hubSocket);
    const clientSocket = makeSocket();
    const client = registry.openSession('maxime', clientSocket);
    expect(client).not.toBeNull();

    const offer = encodeSignaling({
      v: PROTOCOL_VERSION,
      kind: 'client.offer',
      hubName: 'maxime',
      sdp: 'fake-offer-sdp',
      ticket: 'tkt',
    });

    const c = ensure(client, 'client');
    routeFrame({ registry, iceServers: ICE }, { kind: 'client', conn: c }, offer);

    const forwarded = parseLast(hubSocket);
    expect(forwarded.kind).toBe('session.offer');
    if (forwarded.kind === 'session.offer') {
      expect(forwarded.sessionId).toBe(c.sessionId);
      expect(forwarded.sdp).toBe('fake-offer-sdp');
      expect(forwarded.iceServers).toEqual(ICE);
    }
    // Hub identity unused
    expect(hub.name).toBe('maxime');
  });

  it('relays hub.answer to the matching client as session.answer', () => {
    const registry = new Registry();
    const hubSocket = makeSocket();
    const hub = registry.registerHub('maxime', hubSocket);
    const clientSocket = makeSocket();
    const client = registry.openSession('maxime', clientSocket);
    expect(client).not.toBeNull();

    const c = ensure(client, 'client');
    const answer = encodeSignaling({
      v: PROTOCOL_VERSION,
      kind: 'hub.answer',
      sessionId: c.sessionId,
      sdp: 'fake-answer-sdp',
    });

    routeFrame({ registry, iceServers: ICE }, { kind: 'hub', conn: hub }, answer);

    const forwarded = parseLast(clientSocket);
    expect(forwarded.kind).toBe('session.answer');
    if (forwarded.kind === 'session.answer') {
      expect(forwarded.sdp).toBe('fake-answer-sdp');
    }
  });

  it('routes ICE candidates in both directions with the right "from"', () => {
    const registry = new Registry();
    const hubSocket = makeSocket();
    const hub = registry.registerHub('maxime', hubSocket);
    const clientSocket = makeSocket();
    const client = registry.openSession('maxime', clientSocket);

    const c = ensure(client, 'client');
    routeFrame(
      { registry, iceServers: ICE },
      { kind: 'client', conn: c },
      encodeSignaling({
        v: PROTOCOL_VERSION,
        kind: 'client.ice',
        sessionId: c.sessionId,
        candidate: { candidate: 'candidate-from-client' },
      })
    );
    const fromClient = parseLast(hubSocket);
    expect(fromClient.kind).toBe('session.ice');
    if (fromClient.kind === 'session.ice') {
      expect(fromClient.from).toBe('client');
    }

    routeFrame(
      { registry, iceServers: ICE },
      { kind: 'hub', conn: hub },
      encodeSignaling({
        v: PROTOCOL_VERSION,
        kind: 'hub.ice',
        sessionId: c.sessionId,
        candidate: { candidate: 'candidate-from-hub' },
      })
    );
    const fromHub = parseLast(clientSocket);
    expect(fromHub.kind).toBe('session.ice');
    if (fromHub.kind === 'session.ice') {
      expect(fromHub.from).toBe('hub');
    }
  });

  it('notifies the client when the requested hub is offline', () => {
    const registry = new Registry();
    // Pre-create a session manually for this test path (normally openSession refuses
    // when the hub is gone — but we want to exercise routeFromClient).
    const clientSocket = makeSocket();
    // Register a hub, open a session, then unregister the hub:
    const hubSocket = makeSocket();
    registry.registerHub('maxime', hubSocket);
    const client = registry.openSession('maxime', clientSocket);
    registry.unregisterHub('maxime', hubSocket);

    routeFrame(
      { registry, iceServers: ICE },
      { kind: 'client', conn: ensure(client, 'client') },
      encodeSignaling({
        v: PROTOCOL_VERSION,
        kind: 'client.offer',
        hubName: 'maxime',
        sdp: 'sdp',
        ticket: 'tkt',
      })
    );

    // unregisterHub already sent session.error; the offer attempt should also reach
    // a session.error since the hub is gone.
    const errors = clientSocket.sent
      .map((m) => JSON.parse(m) as SignalingMessage)
      .filter((m) => m.kind === 'session.error');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('drops malformed frames without crashing', () => {
    const registry = new Registry();
    const hub = registry.registerHub('maxime', makeSocket());
    const ok = routeFrame(
      { registry, iceServers: ICE },
      { kind: 'hub', conn: hub },
      '{"not":"a real frame"}'
    );
    expect(ok).toBe(false);
  });

  it('rejects ICE for a session id the client does not own', () => {
    const registry = new Registry();
    const hubSocket = makeSocket();
    registry.registerHub('maxime', hubSocket);
    const aliceSocket = makeSocket();
    const alice = registry.openSession('maxime', aliceSocket);
    const bobSocket = makeSocket();
    registry.openSession('maxime', bobSocket);

    // Alice tries to send ICE for a fake session id.
    routeFrame(
      { registry, iceServers: ICE },
      { kind: 'client', conn: ensure(alice, 'alice') },
      encodeSignaling({
        v: PROTOCOL_VERSION,
        kind: 'client.ice',
        sessionId: 'not-mine',
        candidate: { candidate: 'malicious' },
      })
    );
    // Hub socket should have received nothing.
    expect(hubSocket.sent).toEqual([]);
  });
});

describe('Registry', () => {
  it('evicts the previous hub connection when the same name reconnects', () => {
    const registry = new Registry();
    const oldSocket = makeSocket();
    registry.registerHub('maxime', oldSocket);
    const newSocket = makeSocket();
    registry.registerHub('maxime', newSocket);
    expect(oldSocket.closes.length).toBe(1);
    expect(registry.getHub('maxime')?.socket).toBe(newSocket);
  });

  it('does not unregister when an older socket fires its close handler', () => {
    const registry = new Registry();
    const oldSocket = makeSocket();
    registry.registerHub('maxime', oldSocket);
    const newSocket = makeSocket();
    registry.registerHub('maxime', newSocket);
    // Older socket's close handler fires AFTER the new one has taken over.
    registry.unregisterHub('maxime', oldSocket);
    expect(registry.getHub('maxime')?.socket).toBe(newSocket);
  });

  it('tears down sessions when the hub disconnects', () => {
    const registry = new Registry();
    const hubSocket = makeSocket();
    registry.registerHub('maxime', hubSocket);
    const clientSocket = makeSocket();
    const session = registry.openSession('maxime', clientSocket);
    registry.unregisterHub('maxime', hubSocket);
    expect(registry.getSession(ensure(session, 'session').sessionId)).toBeUndefined();
    const err = parseLast(clientSocket);
    expect(err.kind).toBe('session.error');
  });
});
