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
    expect(() =>
      routeFrame(
        { registry, iceServers: ICE },
        { kind: 'hub', conn: hub },
        '{"not":"a real frame"}'
      )
    ).not.toThrow();
  });

  it('hub.abort tears down the session and notifies the client', () => {
    const registry = new Registry();
    const hubSocket = makeSocket();
    const hub = registry.registerHub('maxime', hubSocket);
    const clientSocket = makeSocket();
    const client = registry.openSession('maxime', clientSocket);
    const c = ensure(client, 'client');

    routeFrame(
      { registry, iceServers: ICE },
      { kind: 'hub', conn: hub },
      encodeSignaling({
        v: PROTOCOL_VERSION,
        kind: 'hub.abort',
        sessionId: c.sessionId,
        reason: 'kicked',
      })
    );

    const last = parseLast(clientSocket);
    expect(last.kind).toBe('session.error');
    if (last.kind === 'session.error') {
      expect(last.code).toBe('hub-abort');
    }
    expect(clientSocket.closes.length).toBe(1);
    expect(registry.getSession(c.sessionId)).toBeUndefined();
  });

  it('client.abort closes the session and notifies the hub', () => {
    const registry = new Registry();
    const hubSocket = makeSocket();
    registry.registerHub('maxime', hubSocket);
    const clientSocket = makeSocket();
    const client = registry.openSession('maxime', clientSocket);
    const c = ensure(client, 'client');

    routeFrame(
      { registry, iceServers: ICE },
      { kind: 'client', conn: c },
      encodeSignaling({
        v: PROTOCOL_VERSION,
        kind: 'client.abort',
        sessionId: c.sessionId,
        reason: 'user-cancel',
      })
    );

    const last = parseLast(hubSocket);
    expect(last.kind).toBe('session.error');
    if (last.kind === 'session.error') {
      expect(last.code).toBe('client-abort');
    }
    expect(clientSocket.closes.length).toBe(1);
    expect(registry.getSession(c.sessionId)).toBeUndefined();
  });

  it('hub frames addressing an unknown session are silent no-ops', () => {
    const registry = new Registry();
    const hubSocket = makeSocket();
    const hub = registry.registerHub('maxime', hubSocket);

    routeFrame(
      { registry, iceServers: ICE },
      { kind: 'hub', conn: hub },
      encodeSignaling({
        v: PROTOCOL_VERSION,
        kind: 'hub.answer',
        sessionId: 'no-such-session',
        sdp: 'sdp',
      })
    );
    expect(hubSocket.sent).toEqual([]);
  });

  it('hub.ice for a session owned by a different hub is dropped', () => {
    const registry = new Registry();
    const aliceHub = registry.registerHub('alice', makeSocket());
    const bobHub = registry.registerHub('bob', makeSocket());
    const clientSocket = makeSocket();
    const session = registry.openSession('alice', clientSocket);
    const s = ensure(session, 'session');

    routeFrame(
      { registry, iceServers: ICE },
      { kind: 'hub', conn: bobHub },
      encodeSignaling({
        v: PROTOCOL_VERSION,
        kind: 'hub.ice',
        sessionId: s.sessionId,
        candidate: { candidate: 'forged' },
      })
    );
    expect(clientSocket.sent).toEqual([]);
    // aliceHub is the rightful owner.
    expect(aliceHub.name).toBe('alice');
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

  it('openSession returns null when the hub is not registered', () => {
    const registry = new Registry();
    expect(registry.openSession('unknown', makeSocket())).toBeNull();
  });

  it('closeSession is a no-op on an unknown sessionId', () => {
    const registry = new Registry();
    expect(() => registry.closeSession('not-a-session')).not.toThrow();
  });

  it('closeSession rejects an originator that does not own the session', () => {
    const registry = new Registry();
    registry.registerHub('maxime', makeSocket());
    const clientSocket = makeSocket();
    const session = registry.openSession('maxime', clientSocket);
    const s = ensure(session, 'session');

    // A foreign socket (not the client and not the owning hub) can't close it.
    registry.closeSession(s.sessionId, makeSocket());
    expect(registry.getSession(s.sessionId)).not.toBeUndefined();

    // The owning client socket can.
    registry.closeSession(s.sessionId, clientSocket);
    expect(registry.getSession(s.sessionId)).toBeUndefined();
  });

  it('stats() reflects current hubs and sessions', () => {
    const registry = new Registry();
    registry.registerHub('maxime', makeSocket());
    registry.openSession('maxime', makeSocket());
    const s = registry.stats();
    expect(s.hubs).toBe(1);
    expect(s.sessions).toBe(1);
    expect(s.hubNames).toEqual(['maxime']);
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
