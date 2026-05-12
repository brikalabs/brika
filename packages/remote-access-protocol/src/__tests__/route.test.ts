import { describe, expect, it } from 'bun:test';
import { translateFromClient, translateFromHub } from '../route';
import type {
  ClientAbortMessage,
  ClientIceMessage,
  ClientOfferMessage,
  HubAbortMessage,
  HubAnswerMessage,
  HubIceMessage,
  IceServer,
} from '../signaling';
import { PROTOCOL_VERSION } from '../version';

const ICE_SERVERS: IceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

describe('translateFromHub', () => {
  it('hub.answer → session.answer with same sessionId and sdp', () => {
    const msg: HubAnswerMessage = {
      v: PROTOCOL_VERSION,
      kind: 'hub.answer',
      sessionId: 'sess-1',
      sdp: 'v=0\r\n...',
    };
    expect(translateFromHub(msg)).toEqual({
      v: PROTOCOL_VERSION,
      kind: 'session.answer',
      sessionId: 'sess-1',
      sdp: 'v=0\r\n...',
    });
  });

  it('hub.ice → session.ice tagged from:hub', () => {
    const msg: HubIceMessage = {
      v: PROTOCOL_VERSION,
      kind: 'hub.ice',
      sessionId: 'sess-2',
      candidate: { candidate: 'cand', sdpMid: '0' },
    };
    expect(translateFromHub(msg)).toEqual({
      v: PROTOCOL_VERSION,
      kind: 'session.ice',
      sessionId: 'sess-2',
      candidate: { candidate: 'cand', sdpMid: '0' },
      from: 'hub',
    });
  });

  it('hub.abort → session.error with hub-abort code and provided reason', () => {
    const msg: HubAbortMessage = {
      v: PROTOCOL_VERSION,
      kind: 'hub.abort',
      sessionId: 'sess-3',
      reason: 'shutting down',
    };
    expect(translateFromHub(msg)).toEqual({
      v: PROTOCOL_VERSION,
      kind: 'session.error',
      sessionId: 'sess-3',
      code: 'hub-abort',
      message: 'shutting down',
    });
  });

  it('hub.abort defaults to a generic message when reason missing', () => {
    const msg: HubAbortMessage = {
      v: PROTOCOL_VERSION,
      kind: 'hub.abort',
      sessionId: 'sess-4',
    };
    expect(translateFromHub(msg)).toMatchObject({
      kind: 'session.error',
      code: 'hub-abort',
      message: 'Hub aborted session',
    });
  });
});

describe('translateFromClient', () => {
  it('client.offer → session.offer carrying clientCaps and iceServers', () => {
    const msg: ClientOfferMessage = {
      v: PROTOCOL_VERSION,
      kind: 'client.offer',
      hubName: 'maxime',
      sdp: 'v=0\r\n...',
      ticket: 'tkt',
      caps: ['rpc.v1'],
    };
    expect(translateFromClient(msg, 'sess-1', ICE_SERVERS)).toEqual({
      v: PROTOCOL_VERSION,
      kind: 'session.offer',
      sessionId: 'sess-1',
      sdp: 'v=0\r\n...',
      clientCaps: ['rpc.v1'],
      iceServers: ICE_SERVERS,
    });
  });

  it('client.ice → session.ice tagged from:client (sessionId provided by coordinator)', () => {
    const msg: ClientIceMessage = {
      v: PROTOCOL_VERSION,
      kind: 'client.ice',
      sessionId: 'wire-says-sess-X',
      candidate: { candidate: 'c' },
    };
    // The translator uses the coordinator-supplied sessionId, not the wire one.
    expect(translateFromClient(msg, 'authoritative', ICE_SERVERS)).toEqual({
      v: PROTOCOL_VERSION,
      kind: 'session.ice',
      sessionId: 'authoritative',
      candidate: { candidate: 'c' },
      from: 'client',
    });
  });

  it('client.abort → session.error with client-abort code and provided reason', () => {
    const msg: ClientAbortMessage = {
      v: PROTOCOL_VERSION,
      kind: 'client.abort',
      sessionId: 's',
      reason: 'user closed tab',
    };
    expect(translateFromClient(msg, 's', ICE_SERVERS)).toEqual({
      v: PROTOCOL_VERSION,
      kind: 'session.error',
      sessionId: 's',
      code: 'client-abort',
      message: 'user closed tab',
    });
  });

  it('client.abort defaults to a generic message when reason missing', () => {
    const msg: ClientAbortMessage = {
      v: PROTOCOL_VERSION,
      kind: 'client.abort',
      sessionId: 's',
    };
    expect(translateFromClient(msg, 's', ICE_SERVERS)).toMatchObject({
      kind: 'session.error',
      code: 'client-abort',
      message: 'Client aborted',
    });
  });
});
