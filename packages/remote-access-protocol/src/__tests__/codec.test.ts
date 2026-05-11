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
      const raw = JSON.stringify({ v: 99, kind: 'client.offer', hubName: 'x', sdp: '', ticket: '' });
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
        bodyText: '{"email":"a@b"}',
      };
      const decoded = decodeRpc(encodeRpc(msg));
      expect(decoded).toEqual(msg);
    });

    it('rejects wrong major version', () => {
      const raw = JSON.stringify({ v: 99, kind: 'hello', role: 'hub' });
      expect(decodeRpc(raw)).toBeNull();
    });
  });
});
