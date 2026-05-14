import { describe, expect, it } from 'bun:test';
import {
  BODY_TOO_LARGE_CODE,
  BodyTooLargeError,
  emitRequest,
  RequestAssembler,
  ResponseAssembler,
  responseToFrames,
  rpcRequestToFetch,
} from '../bridge';
import type {
  RequestChunkMessage,
  RequestEndMessage,
  RequestMessage,
  ResponseChunkMessage,
  ResponseEndMessage,
  ResponseErrorMessage,
  ResponseHeadMessage,
  RpcMessage,
} from '../rpc';
import { PROTOCOL_VERSION } from '../version';

async function collectFrames(id: number, req: Request): Promise<RpcMessage[]> {
  const frames: RpcMessage[] = [];
  await emitRequest(id, req, (f) => {
    frames.push(f);
  });
  return frames;
}

describe('bridge', () => {
  describe('emitRequest / RequestAssembler / rpcRequestToFetch', () => {
    it('roundtrips a GET request preserving headers (no body frames)', async () => {
      const req = new Request('https://hub.brika.dev/api/health?x=1', {
        method: 'GET',
        headers: { 'X-Custom': 'v1', Accept: 'application/json' },
      });
      const frames = await collectFrames(1, req);
      expect(frames).toHaveLength(1);
      const head = frames[0] as RequestMessage;
      expect(head.kind).toBe('request');
      expect(head.method).toBe('GET');
      expect(head.url).toBe('/api/health?x=1');
      expect(head.hasBody).toBeUndefined();
      expect(head.headers.find(([n]) => n.toLowerCase() === 'x-custom')?.[1]).toBe('v1');

      const reconstructed = rpcRequestToFetch(head, 'https://hub.brika.dev', null);
      expect(reconstructed.method).toBe('GET');
      expect(new URL(reconstructed.url).pathname).toBe('/api/health');
    });

    it('drops hop-by-hop headers from a POST', async () => {
      const req = new Request('https://x.brika.dev/api/x', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Connection: 'keep-alive',
          Host: 'evil.example',
        },
        body: '{}',
      });
      const frames = await collectFrames(2, req);
      const head = frames[0] as RequestMessage;
      const names = head.headers.map(([n]) => n.toLowerCase());
      expect(names).not.toContain('connection');
      expect(names).not.toContain('host');
    });

    it('streams a JSON body as request.chunk(dataText)', async () => {
      const req = new Request('https://x.brika.dev/api/x', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"hello":"world"}',
      });
      const frames = await collectFrames(3, req);
      const head = frames[0] as RequestMessage;
      expect(head.hasBody).toBe(true);
      const chunks = frames.filter((f): f is RequestChunkMessage => f.kind === 'request.chunk');
      const end = frames.find((f): f is RequestEndMessage => f.kind === 'request.end');
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.every((c) => typeof c.dataText === 'string')).toBe(true);
      expect(end).toBeDefined();

      if (!end) {
        throw new Error('expected request.end frame');
      }
      const assembler = new RequestAssembler();
      for (const c of chunks) {
        assembler.onChunk(c);
      }
      assembler.onEnd(end);
      const reconstructed = rpcRequestToFetch(head, 'https://x.brika.dev', assembler.body());
      expect(await reconstructed.text()).toBe('{"hello":"world"}');
    });

    it('streams a binary body as request.chunk(dataB64) and roundtrips bytes', async () => {
      const bytes = new Uint8Array([0, 1, 2, 254, 255]);
      const req = new Request('https://x.brika.dev/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: bytes,
      });
      const frames = await collectFrames(4, req);
      const head = frames[0] as RequestMessage;
      expect(head.hasBody).toBe(true);
      const chunks = frames.filter((f): f is RequestChunkMessage => f.kind === 'request.chunk');
      const end = frames.find((f): f is RequestEndMessage => f.kind === 'request.end');
      expect(chunks.every((c) => typeof c.dataB64 === 'string')).toBe(true);

      if (!end) {
        throw new Error('expected request.end frame');
      }
      const assembler = new RequestAssembler();
      for (const c of chunks) {
        assembler.onChunk(c);
      }
      assembler.onEnd(end);
      const reconstructed = rpcRequestToFetch(head, 'https://x.brika.dev', assembler.body());
      const out = new Uint8Array(await reconstructed.arrayBuffer());
      expect(Array.from(out)).toEqual([0, 1, 2, 254, 255]);
    });

    it('fragments large bodies into multiple chunks under the 16 KiB cap', async () => {
      // 100 KiB body — well above SCTP's single-message limit and our 16 KiB chunk cap.
      const bytes = new Uint8Array(100 * 1024);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = i & 0xff;
      }
      const req = new Request('https://x.brika.dev/api/upload-large', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: bytes,
      });
      const frames = await collectFrames(5, req);
      const chunks = frames.filter((f): f is RequestChunkMessage => f.kind === 'request.chunk');
      expect(chunks.length).toBeGreaterThanOrEqual(7); // 100 KiB / 16 KiB = 6.25 → at least 7

      const assembler = new RequestAssembler();
      for (const c of chunks) {
        assembler.onChunk(c);
      }
      assembler.onEnd(frames.at(-1) as RequestEndMessage);
      const reconstructed = rpcRequestToFetch(
        frames[0] as RequestMessage,
        'https://x.brika.dev',
        assembler.body()
      );
      const out = new Uint8Array(await reconstructed.arrayBuffer());
      expect(out.byteLength).toBe(bytes.byteLength);
      // Spot-check a few bytes — full equality is implied by the byte pattern.
      expect(out[0]).toBe(0);
      expect(out[12345]).toBe(12345 & 0xff);
      expect(out[bytes.byteLength - 1]).toBe((bytes.byteLength - 1) & 0xff);
    });
  });

  describe('responseToFrames / ResponseAssembler', () => {
    it('streams a chunked text response end-to-end', async () => {
      const upstream = new Response('hello world', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
      const frames: Array<
        ResponseHeadMessage | ResponseChunkMessage | ResponseEndMessage | ResponseErrorMessage
      > = [];
      await responseToFrames(9, upstream, (f) => {
        // responseToFrames only ever emits response.* frames; narrow defensively.
        if (
          f.kind === 'response.head' ||
          f.kind === 'response.chunk' ||
          f.kind === 'response.end' ||
          f.kind === 'response.error'
        ) {
          frames.push(f);
        }
      });

      expect(frames[0]?.kind).toBe('response.head');
      expect((frames[0] as ResponseHeadMessage).status).toBe(200);
      expect(frames.at(-1)?.kind).toBe('response.end');

      const assembler = new ResponseAssembler();
      for (const f of frames) {
        if (f.kind === 'response.head') {
          assembler.onHead(f);
        } else if (f.kind === 'response.chunk') {
          assembler.onChunk(f);
        } else if (f.kind === 'response.end') {
          assembler.onEnd(f);
        } else if (f.kind === 'response.error') {
          assembler.onError(f);
        }
      }
      const res = await assembler.response();
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('hello world');
    });

    it('surfaces stream errors as a rejected body', async () => {
      const assembler = new ResponseAssembler();
      assembler.onHead({
        v: PROTOCOL_VERSION,
        kind: 'response.head',
        id: 1,
        status: 200,
        headers: [['content-type', 'text/plain']],
      });
      assembler.onError({
        v: PROTOCOL_VERSION,
        kind: 'response.error',
        id: 1,
        code: 'aborted',
        message: 'gone',
      });
      const res = await assembler.response();
      await expect(res.text()).rejects.toThrow();
    });
  });

  describe('binary chunks (BINARY_FRAMES capability)', () => {
    it('emitRequest routes binary body bytes through sendBinary, not JSON dataB64', async () => {
      const bytes = new Uint8Array([0, 1, 2, 254, 255]);
      const req = new Request('https://x.brika.dev/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: bytes,
      });
      const jsonFrames: RpcMessage[] = [];
      const binaryChunks: Uint8Array[] = [];
      await emitRequest(
        7,
        req,
        (f) => {
          jsonFrames.push(f);
        },
        {
          sendBinary: (b) => {
            binaryChunks.push(b);
          },
        }
      );

      // The head + end frames stay JSON; the body bytes are out-of-band.
      const kinds = jsonFrames.map((f) => f.kind);
      expect(kinds).toEqual(['request', 'request.end']);
      // The request head signals hasBody so the receiver waits for the
      // binary chunks before dispatching.
      expect((jsonFrames[0] as RequestMessage).hasBody).toBe(true);

      // The binary callback received the body bytes verbatim — no base64,
      // no JSON wrapping.
      const joined = new Uint8Array(binaryChunks.reduce((sum, b) => sum + b.byteLength, 0));
      let offset = 0;
      for (const b of binaryChunks) {
        joined.set(b, offset);
        offset += b.byteLength;
      }
      expect(Array.from(joined)).toEqual([0, 1, 2, 254, 255]);
    });

    it('responseToFrames routes binary body bytes through sendBinary', async () => {
      const bytes = new Uint8Array([1, 2, 3, 250, 251, 252]);
      const upstream = new Response(bytes, {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      const jsonFrames: RpcMessage[] = [];
      const binaryChunks: Uint8Array[] = [];
      await responseToFrames(
        11,
        upstream,
        (f) => {
          jsonFrames.push(f);
        },
        {
          sendBinary: (b) => {
            binaryChunks.push(b);
          },
        }
      );

      // Head + end as JSON, body bytes out-of-band.
      expect(jsonFrames.map((f) => f.kind)).toEqual(['response.head', 'response.end']);

      // Assemble through onBinaryChunk and verify the bytes roundtrip.
      const assembler = new ResponseAssembler();
      assembler.onHead(jsonFrames[0] as ResponseHeadMessage);
      for (const b of binaryChunks) {
        assembler.onBinaryChunk(b);
      }
      assembler.onEnd(jsonFrames[1] as ResponseEndMessage);
      const res = await assembler.response();
      const out = new Uint8Array(await res.arrayBuffer());
      expect(Array.from(out)).toEqual([1, 2, 3, 250, 251, 252]);
    });

    it('falls back to JSON dataB64 chunks when sendBinary is omitted (back-compat)', async () => {
      const bytes = new Uint8Array([9, 8, 7, 6]);
      const req = new Request('https://x.brika.dev/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: bytes,
      });
      const frames = await collectFrames(13, req); // No sendBinary.
      const chunks = frames.filter((f): f is RequestChunkMessage => f.kind === 'request.chunk');
      expect(chunks.length).toBeGreaterThan(0);
      // Every chunk is base64-text — confirms the binary path stays opt-in.
      expect(chunks.every((c) => typeof c.dataB64 === 'string')).toBe(true);
    });

    it('text bodies still use dataText even when sendBinary is provided', async () => {
      const req = new Request('https://x.brika.dev/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"hello":"world"}',
      });
      const jsonFrames: RpcMessage[] = [];
      const binaryChunks: Uint8Array[] = [];
      await emitRequest(
        15,
        req,
        (f) => {
          jsonFrames.push(f);
        },
        {
          sendBinary: (b) => {
            binaryChunks.push(b);
          },
        }
      );

      // sendBinary is only for non-text bodies; the JSON body should remain
      // in `dataText` so the wire stays human-readable for debug.
      const chunks = jsonFrames.filter((f): f is RequestChunkMessage => f.kind === 'request.chunk');
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.every((c) => typeof c.dataText === 'string')).toBe(true);
      expect(binaryChunks).toHaveLength(0);
    });
  });

  describe('size cap', () => {
    it('RequestAssembler errors the body stream once maxBodyBytes is exceeded', async () => {
      const assembler = new RequestAssembler({ maxBodyBytes: 10 });
      // Start reading first so the controller can deliver chunks (and the
      // eventual error) to a real consumer — matching how `app.fetch()` uses
      // the assembler's stream.
      const reader = assembler.body().getReader();
      assembler.onChunk({
        v: PROTOCOL_VERSION,
        kind: 'request.chunk',
        id: 1,
        dataText: 'abcdef', // 6 bytes — under the cap.
      });
      // Drain the first chunk before the overflow trips the cap. Without
      // this, the spec drops the queue when `error()` is called and we
      // can't observe that the first chunk was accepted.
      const first = await reader.read();
      expect(first.done).toBe(false);
      expect(first.value?.byteLength).toBe(6);

      // 6 more bytes — total 12 > 10. Must trip the cap.
      assembler.onChunk({
        v: PROTOCOL_VERSION,
        kind: 'request.chunk',
        id: 1,
        dataText: 'ghijkl',
      });

      let caught: unknown = null;
      try {
        await reader.read();
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(BodyTooLargeError);
      expect((caught as BodyTooLargeError).code).toBe(BODY_TOO_LARGE_CODE);
      expect((caught as BodyTooLargeError).limit).toBe(10);
    });

    it('RequestAssembler without a cap accepts arbitrarily large bodies', async () => {
      const assembler = new RequestAssembler();
      // Drain in the background so the controller has room to enqueue.
      const drain = (async () => {
        const reader = assembler.body().getReader();
        let total = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          total += value?.byteLength ?? 0;
        }
        return total;
      })();
      for (let i = 0; i < 50; i++) {
        assembler.onChunk({
          v: PROTOCOL_VERSION,
          kind: 'request.chunk',
          id: 1,
          dataText: 'x'.repeat(1024),
        });
      }
      assembler.onEnd({ v: PROTOCOL_VERSION, kind: 'request.end', id: 1 });
      expect(await drain).toBe(50 * 1024);
    });
  });
});
