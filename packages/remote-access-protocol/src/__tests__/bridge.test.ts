import { describe, expect, it } from 'bun:test';
import {
  requestToFrames,
  ResponseAssembler,
  responseToFrames,
  rpcRequestToFetch,
} from '../bridge';
import type {
  ResponseChunkMessage,
  ResponseEndMessage,
  ResponseErrorMessage,
  ResponseHeadMessage,
} from '../rpc';

describe('bridge', () => {
  describe('requestToFrames / rpcRequestToFetch', () => {
    it('roundtrips a GET request preserving headers', async () => {
      const req = new Request('https://maxime.brika.dev/api/health?x=1', {
        method: 'GET',
        headers: { 'X-Custom': 'v1', Accept: 'application/json' },
      });
      const msg = await requestToFrames(1, req);
      expect(msg.method).toBe('GET');
      expect(msg.url).toBe('/api/health?x=1');
      expect(msg.bodyText).toBeUndefined();
      expect(msg.bodyB64).toBeUndefined();
      expect(msg.headers.find(([n]) => n.toLowerCase() === 'x-custom')?.[1]).toBe('v1');

      const reconstructed = rpcRequestToFetch(msg, 'https://maxime.brika.dev');
      expect(reconstructed.method).toBe('GET');
      expect(new URL(reconstructed.url).pathname).toBe('/api/health');
    });

    it('drops hop-by-hop headers', async () => {
      const req = new Request('https://x.brika.dev/api/x', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Connection: 'keep-alive',
          Host: 'evil.example',
        },
        body: '{}',
      });
      const msg = await requestToFrames(2, req);
      const names = msg.headers.map(([n]) => n.toLowerCase());
      expect(names).not.toContain('connection');
      expect(names).not.toContain('host');
    });

    it('encodes JSON body as text, binary as base64', async () => {
      const jsonReq = new Request('https://x.brika.dev/api/x', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"hello":"world"}',
      });
      const jsonMsg = await requestToFrames(3, jsonReq);
      expect(jsonMsg.bodyText).toBe('{"hello":"world"}');
      expect(jsonMsg.bodyB64).toBeUndefined();

      const binReq = new Request('https://x.brika.dev/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array([0, 1, 2, 254, 255]),
      });
      const binMsg = await requestToFrames(4, binReq);
      expect(binMsg.bodyText).toBeUndefined();
      expect(binMsg.bodyB64).toBeDefined();

      // Round-trip through rpcRequestToFetch
      const reconstructed = rpcRequestToFetch(binMsg, 'https://x.brika.dev');
      const bytes = new Uint8Array(await reconstructed.arrayBuffer());
      expect(Array.from(bytes)).toEqual([0, 1, 2, 254, 255]);
    });
  });

  describe('responseToFrames / ResponseAssembler', () => {
    it('streams a chunked text response end-to-end', async () => {
      const upstream = new Response('hello world', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
      const frames: Array<
        | ResponseHeadMessage
        | ResponseChunkMessage
        | ResponseEndMessage
        | ResponseErrorMessage
      > = [];
      await responseToFrames(9, upstream, (f) => {
        frames.push(f);
      });

      expect(frames[0]?.kind).toBe('response.head');
      expect((frames[0] as ResponseHeadMessage).status).toBe(200);
      expect(frames.at(-1)?.kind).toBe('response.end');

      // Re-assemble on the client side.
      const assembler = new ResponseAssembler();
      for (const f of frames) {
        if (f.kind === 'response.head') assembler.onHead(f);
        else if (f.kind === 'response.chunk') assembler.onChunk(f);
        else if (f.kind === 'response.end') assembler.onEnd(f);
        else if (f.kind === 'response.error') assembler.onError(f);
      }
      const res = await assembler.response();
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('hello world');
    });

    it('surfaces stream errors as a rejected body', async () => {
      const assembler = new ResponseAssembler();
      assembler.onHead({
        v: 1,
        kind: 'response.head',
        id: 1,
        status: 200,
        headers: [['content-type', 'text/plain']],
      });
      assembler.onError({
        v: 1,
        kind: 'response.error',
        id: 1,
        code: 'aborted',
        message: 'gone',
      });
      const res = await assembler.response();
      await expect(res.text()).rejects.toThrow();
    });
  });
});
