import { describe, expect, it } from 'bun:test';
import { StaticIceServerProvider } from './ice-provider';
import {
  type AttachmentStore,
  type HubSessionAttachment,
  HubSessionState,
  type WsLike,
} from './session-state';
import { DEFAULT_ICE_SERVERS } from './signaling';
import { PROTOCOL_VERSION } from './version';

/** Recording fake WS — captures every send + close call. */
class FakeWs implements WsLike {
  readonly sent: string[] = [];
  closedWith: { code?: number; reason?: string } | null = null;
  send(data: string): void {
    if (this.closedWith) {
      throw new Error('send on closed socket');
    }
    this.sent.push(data);
  }
  close(code?: number, reason?: string): void {
    this.closedWith = { code, reason };
  }
  /** Find the first sent frame whose JSON has the given kind. */
  frame<T = unknown>(kind: string): T | null {
    for (const raw of this.sent) {
      const parsed = JSON.parse(raw);
      if (parsed.kind === kind) {
        return parsed as T;
      }
    }
    return null;
  }
}

function newState(): HubSessionState {
  return new HubSessionState({ ice: new StaticIceServerProvider() });
}

function assertClientAttachment(
  a: HubSessionAttachment | null
): asserts a is HubSessionAttachment & { role: 'client' } {
  if (a?.role !== 'client') {
    throw new Error('expected client attachment');
  }
}

describe('HubSessionState — attach + status', () => {
  it('starts with hubOnline false and no sessions', () => {
    const state = newState();
    expect(state.status()).toEqual({ hubOnline: false, activeSessions: 0 });
  });

  it('attachHub makes hubOnline true', () => {
    const state = newState();
    state.attachHub(new FakeWs(), 'myhub');
    expect(state.status()).toEqual({ hubOnline: true, activeSessions: 0 });
  });

  it('attachHub evicts prior hub WS with close(4001, replaced)', () => {
    const state = newState();
    const first = new FakeWs();
    const second = new FakeWs();
    state.attachHub(first, 'myhub');
    state.attachHub(second, 'myhub');
    expect(first.closedWith).toEqual({ code: 4001, reason: 'replaced by newer connection' });
    expect(second.closedWith).toBeNull();
  });
});

describe('HubSessionState — attachClient', () => {
  it('no hub online → sends hub-offline error, closes 4003, returns null', async () => {
    const state = newState();
    const client = new FakeWs();
    const sessionId = await state.attachClient(client, { name: 'myhub' });
    expect(sessionId).toBeNull();
    expect(client.frame('session.error')).toMatchObject({
      v: PROTOCOL_VERSION,
      kind: 'session.error',
      code: 'hub-offline',
    });
    expect(client.closedWith).toEqual({ code: 4003, reason: 'hub offline' });
  });

  it('hub online → sends session.iceServers, returns a sessionId, registers session', async () => {
    const state = newState();
    state.attachHub(new FakeWs(), 'myhub');
    const client = new FakeWs();
    const sessionId = await state.attachClient(client, { name: 'myhub' });
    expect(sessionId).not.toBeNull();
    expect(client.frame('session.iceServers')).toMatchObject({
      kind: 'session.iceServers',
      iceServers: DEFAULT_ICE_SERVERS,
    });
    expect(state.status()).toEqual({ hubOnline: true, activeSessions: 1 });
  });
});

describe('HubSessionState — message routing', () => {
  it('client.offer → hub gets session.offer with iceServers + ctx', async () => {
    const state = newState();
    const hub = new FakeWs();
    state.attachHub(hub, 'myhub');
    const client = new FakeWs();
    const sessionId = await state.attachClient(client, {
      name: 'myhub',
      clientIp: '203.0.113.4',
      clientUserAgent: 'Test/1.0',
    });
    expect(sessionId).not.toBeNull();
    await state.handleMessage(
      client,
      JSON.stringify({
        v: PROTOCOL_VERSION,
        kind: 'client.offer',
        hubName: 'myhub',
        sdp: 'v=0\r\n',
        ticket: 't',
      })
    );
    const offer = hub.frame<{ sessionId: string; clientIp: string; clientUserAgent: string }>(
      'session.offer'
    );
    expect(offer).toMatchObject({
      kind: 'session.offer',
      sessionId,
      sdp: 'v=0\r\n',
      clientIp: '203.0.113.4',
      clientUserAgent: 'Test/1.0',
      iceServers: DEFAULT_ICE_SERVERS,
    });
  });

  it('hub.answer reaches only the matching session', async () => {
    const state = newState();
    const hub = new FakeWs();
    state.attachHub(hub, 'myhub');
    const clientA = new FakeWs();
    const clientB = new FakeWs();
    await state.attachClient(clientA, { name: 'myhub' });
    const sessB = await state.attachClient(clientB, { name: 'myhub' });
    if (!sessB) {
      throw new Error('expected sessionId for clientB');
    }
    await state.handleMessage(
      hub,
      JSON.stringify({
        v: PROTOCOL_VERSION,
        kind: 'hub.answer',
        sessionId: sessB,
        sdp: 'answer-sdp',
      })
    );
    expect(clientA.frame('session.answer')).toBeNull();
    expect(clientB.frame('session.answer')).toMatchObject({
      kind: 'session.answer',
      sessionId: sessB,
      sdp: 'answer-sdp',
    });
  });

  it('hub.abort sends session.error then closes the client with 4002', async () => {
    const state = newState();
    const hub = new FakeWs();
    state.attachHub(hub, 'myhub');
    const client = new FakeWs();
    const sessionId = await state.attachClient(client, { name: 'myhub' });
    if (!sessionId) {
      throw new Error('expected sessionId');
    }
    await state.handleMessage(
      hub,
      JSON.stringify({
        v: PROTOCOL_VERSION,
        kind: 'hub.abort',
        sessionId,
        reason: 'shutting down',
      })
    );
    expect(client.frame('session.error')).toMatchObject({
      code: 'hub-abort',
      message: 'shutting down',
    });
    expect(client.closedWith).toEqual({ code: 4002, reason: 'hub abort' });
  });

  it('client.ice with wrong sessionId is silently dropped', async () => {
    const state = newState();
    const hub = new FakeWs();
    state.attachHub(hub, 'myhub');
    const client = new FakeWs();
    await state.attachClient(client, { name: 'myhub' });
    await state.handleMessage(
      client,
      JSON.stringify({
        v: PROTOCOL_VERSION,
        kind: 'client.ice',
        sessionId: 'someone-elses-session',
        candidate: { candidate: 'cand', sdpMid: '0' },
      })
    );
    expect(hub.frame('session.ice')).toBeNull();
  });
});

describe('HubSessionState — close handling', () => {
  it('hub close tears down every client with hub-gone + 4002', async () => {
    const state = newState();
    const hub = new FakeWs();
    state.attachHub(hub, 'myhub');
    const a = new FakeWs();
    const b = new FakeWs();
    await state.attachClient(a, { name: 'myhub' });
    await state.attachClient(b, { name: 'myhub' });
    state.handleClose(hub);
    expect(a.frame('session.error')).toMatchObject({ code: 'hub-gone' });
    expect(b.frame('session.error')).toMatchObject({ code: 'hub-gone' });
    expect(a.closedWith).toEqual({ code: 4002, reason: 'hub gone' });
    expect(b.closedWith).toEqual({ code: 4002, reason: 'hub gone' });
    expect(state.status()).toEqual({ hubOnline: false, activeSessions: 0 });
  });

  it('evicted hub close (after replacement) does NOT tear down clients', async () => {
    const state = newState();
    const first = new FakeWs();
    state.attachHub(first, 'myhub');
    const client = new FakeWs();
    await state.attachClient(client, { name: 'myhub' });
    const second = new FakeWs();
    state.attachHub(second, 'myhub');
    state.handleClose(first);
    expect(client.closedWith).toBeNull();
    expect(state.status()).toEqual({ hubOnline: true, activeSessions: 1 });
  });

  it('client close removes only that session', async () => {
    const state = newState();
    state.attachHub(new FakeWs(), 'myhub');
    const a = new FakeWs();
    const b = new FakeWs();
    await state.attachClient(a, { name: 'myhub' });
    await state.attachClient(b, { name: 'myhub' });
    state.handleClose(a);
    expect(state.status().activeSessions).toBe(1);
  });
});

describe('HubSessionState — rehydrate', () => {
  it('rehydrate restores hub + clients from an external attachment store', async () => {
    // Mimics the Cloudflare DO pattern: the AttachmentStore survives across
    // state instances (like ws.serializeAttachment survives DO hibernation).
    const backing = new Map<WsLike, HubSessionAttachment>();
    const store: AttachmentStore = {
      get: (ws) => backing.get(ws) ?? null,
      set: (ws, a) => {
        backing.set(ws, a);
      },
      delete: (ws) => {
        backing.delete(ws);
      },
    };
    const ice = new StaticIceServerProvider();

    const hub = new FakeWs();
    const client = new FakeWs();
    {
      const first = new HubSessionState({ ice, attachments: store });
      first.attachHub(hub, 'myhub');
      await first.attachClient(client, { name: 'myhub' });
    }

    const second = new HubSessionState({ ice, attachments: store });
    second.rehydrate(hub);
    second.rehydrate(client);
    expect(second.status()).toEqual({ hubOnline: true, activeSessions: 1 });

    const attachment = backing.get(client) ?? null;
    assertClientAttachment(attachment);
    await second.handleMessage(
      hub,
      JSON.stringify({
        v: PROTOCOL_VERSION,
        kind: 'hub.answer',
        sessionId: attachment.sessionId,
        sdp: 'answer',
      })
    );
    expect(client.frame('session.answer')).toMatchObject({ sdp: 'answer' });
  });
});
