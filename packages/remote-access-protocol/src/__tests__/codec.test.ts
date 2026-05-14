import { describe, expect, it } from 'bun:test';
import { decodeRpc, decodeSignaling, encodeRpc, encodeSignaling } from '../codec';
import type { RequestMessage } from '../rpc';
import type { ClientOfferMessage } from '../signaling';
import { PROTOCOL_VERSION } from '../version';

describe('codec', () => {
  describe('signaling', () => {
    it('roundtrips a valid frame', () => {
      const msg: ClientOfferMessage = {
        v: PROTOCOL_VERSION,
        kind: 'client.offer',
        hubName: 'maxime',
        sdp: 'v=0\r\n...',
        ticket: 'tkt_abc',
      };
      const decoded = decodeSignaling(encodeSignaling(msg));
      expect(decoded).toEqual(msg);
    });

    it('rejects wrong protocol version', () => {
      const raw = JSON.stringify({
        v: 99,
        kind: 'client.offer',
        hubName: 'x',
        sdp: '',
        ticket: '',
      });
      expect(decodeSignaling(raw)).toBeNull();
    });

    it('rejects unknown kind', () => {
      const raw = JSON.stringify({ v: PROTOCOL_VERSION, kind: 'made.up' });
      expect(decodeSignaling(raw)).toBeNull();
    });

    it('rejects malformed JSON', () => {
      expect(decodeSignaling('not json')).toBeNull();
      expect(decodeSignaling('null')).toBeNull();
      expect(decodeSignaling('"a"')).toBeNull();
    });

    it('preserves unknown extra fields for forward-compat', () => {
      const raw = JSON.stringify({
        v: PROTOCOL_VERSION,
        kind: 'client.offer',
        hubName: 'a',
        sdp: 'b',
        ticket: 'c',
        futureField: { nested: true },
      });
      const decoded = decodeSignaling(raw);
      expect(decoded).not.toBeNull();
      expect((decoded as unknown as Record<string, unknown>).futureField).toEqual({
        nested: true,
      });
    });
  });

  describe('rpc', () => {
    it('roundtrips a request frame', () => {
      const msg: RequestMessage = {
        v: PROTOCOL_VERSION,
        kind: 'request',
        id: 7,
        method: 'POST',
        url: '/api/login',
        headers: [['content-type', 'application/json']],
        hasBody: true,
      };
      const decoded = decodeRpc(encodeRpc(msg));
      expect(decoded).toEqual(msg);
    });

    it('roundtrips a request.chunk frame', () => {
      const raw = JSON.stringify({
        v: PROTOCOL_VERSION,
        kind: 'request.chunk',
        id: 7,
        dataText: '{"x":1}',
      });
      const decoded = decodeRpc(raw);
      expect(decoded).not.toBeNull();
      expect(decoded?.kind).toBe('request.chunk');
    });

    it('roundtrips a request.end frame', () => {
      const raw = JSON.stringify({ v: PROTOCOL_VERSION, kind: 'request.end', id: 7 });
      const decoded = decodeRpc(raw);
      expect(decoded?.kind).toBe('request.end');
    });

    it('rejects a request.chunk missing both data fields', () => {
      const raw = JSON.stringify({ v: PROTOCOL_VERSION, kind: 'request.chunk', id: 7 });
      expect(decodeRpc(raw)).toBeNull();
    });

    it('rejects wrong major version', () => {
      const raw = JSON.stringify({ v: 99, kind: 'hello', role: 'hub' });
      expect(decodeRpc(raw)).toBeNull();
    });
  });

  describe('per-kind shape validation', () => {
    it('rejects session.answer missing sessionId', () => {
      const raw = JSON.stringify({ v: PROTOCOL_VERSION, kind: 'session.answer', sdp: 'x' });
      expect(decodeSignaling(raw)).toBeNull();
    });

    it('rejects session.answer with non-string sdp', () => {
      const raw = JSON.stringify({
        v: PROTOCOL_VERSION,
        kind: 'session.answer',
        sessionId: 's',
        sdp: 42,
      });
      expect(decodeSignaling(raw)).toBeNull();
    });

    it('rejects session.ice missing candidate', () => {
      const raw = JSON.stringify({
        v: PROTOCOL_VERSION,
        kind: 'session.ice',
        sessionId: 's',
        from: 'hub',
      });
      expect(decodeSignaling(raw)).toBeNull();
    });

    it('rejects session.ice with invalid `from`', () => {
      const raw = JSON.stringify({
        v: PROTOCOL_VERSION,
        kind: 'session.ice',
        sessionId: 's',
        candidate: { candidate: 'c' },
        from: 'attacker',
      });
      expect(decodeSignaling(raw)).toBeNull();
    });

    it('rejects response.head missing status', () => {
      const raw = JSON.stringify({
        v: PROTOCOL_VERSION,
        kind: 'response.head',
        id: 1,
        headers: [],
      });
      expect(decodeRpc(raw)).toBeNull();
    });

    it('rejects response.chunk with neither dataText nor dataB64', () => {
      const raw = JSON.stringify({ v: PROTOCOL_VERSION, kind: 'response.chunk', id: 1 });
      expect(decodeRpc(raw)).toBeNull();
    });

    it('rejects request with non-finite id', () => {
      const raw = JSON.stringify({
        v: PROTOCOL_VERSION,
        kind: 'request',
        id: 'abc',
        method: 'GET',
        url: '/x',
        headers: [],
      });
      expect(decodeRpc(raw)).toBeNull();
    });

    it('rejects hello with invalid role', () => {
      const raw = JSON.stringify({
        v: PROTOCOL_VERSION,
        kind: 'hello',
        role: 'admin',
        softwareVersion: '1.0',
      });
      expect(decodeRpc(raw)).toBeNull();
    });
  });
});
