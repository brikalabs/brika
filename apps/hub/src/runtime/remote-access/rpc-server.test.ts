import { describe, expect, it } from 'bun:test';
import {
  type BinaryChunkKind,
  PROTOCOL_VERSION,
  type RpcMessage,
  type RpcMessageKind,
} from '@brika/remote-access-protocol';
import type { ApiServer } from '@/runtime/http/api-server';
import type { RpcSender } from './peer-session';
import { RpcServer } from './rpc-server';
import type { SignalingLogger } from './signaling-client';

const silentLog: SignalingLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

interface BinaryOut {
  readonly kind: BinaryChunkKind;
  readonly id: number;
  readonly bytes: Uint8Array;
}

function makeSender(
  outbox: RpcMessage[],
  options: { binaryOutbox?: BinaryOut[]; peerSupportsBinary?: boolean } = {}
): RpcSender {
  return {
    send: (frame) => outbox.push(frame),
    sendBinaryChunk: (kind, id, bytes) => {
      options.binaryOutbox?.push({ kind, id, bytes });
    },
    peerSupportsBinary: () => options.peerSupportsBinary ?? false,
  };
}

function makeApiServer(handler: (req: Request) => Response | Promise<Response>): ApiServer {
  return {
    fetchInternal: (req: Request) => Promise.resolve(handler(req)),
  } as unknown as ApiServer;
}

function makeServer(apiServer: ApiServer): { server: RpcServer; outbox: RpcMessage[] } {
  const outbox: RpcMessage[] = [];
  const server = new RpcServer({
    sessionId: 'sess-1',
    baseOrigin: 'https://hub.local',
    apiServer,
    remoteIp: '203.0.113.1',
    log: silentLog,
  });
  return { server, outbox };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

function collectKinds(frames: RpcMessage[]): RpcMessageKind[] {
  return frames.map((f) => f.kind);
}

describe('RpcServer', () => {
  it('drops `hello` frames silently', () => {
    const { server, outbox } = makeServer(makeApiServer(() => new Response('unused')));
    const sender = makeSender(outbox);
    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'hello',
        role: 'client',
        softwareVersion: 'test',
        maxProtocolVersion: PROTOCOL_VERSION,
      },
      sender
    );
    expect(outbox).toEqual([]);
  });

  it('proxies a request through ApiServer and streams response.head + end', async () => {
    const seenRequests: Request[] = [];
    const api = makeApiServer((req) => {
      seenRequests.push(req);
      return new Response('hello world', { status: 200, headers: { 'x-custom': 'yes' } });
    });
    const { server, outbox } = makeServer(api);
    const sender = makeSender(outbox);

    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request',
        id: 1,
        method: 'GET',
        url: '/api/health',
        headers: [['accept', 'text/plain']],
      },
      sender
    );
    await flush();

    expect(seenRequests.length).toBe(1);
    const seen = seenRequests[0];
    expect(seen?.method).toBe('GET');
    expect(seen?.headers.get('x-real-ip')).toBe('203.0.113.1');

    const kinds = collectKinds(outbox);
    expect(kinds[0]).toBe('response.head');
    expect(kinds.at(-1)).toBe('response.end');
  });

  it('refuses a duplicate id with response.error{code: duplicate-id}', async () => {
    // Never-resolving upstream so the first request stays in-flight when
    // the duplicate arrives; the response itself isn't observed here.
    const api = makeApiServer(() => new Promise<Response>(() => undefined));
    const { server, outbox } = makeServer(api);
    const sender = makeSender(outbox);

    server.handle(
      { v: PROTOCOL_VERSION, kind: 'request', id: 7, method: 'GET', url: '/a', headers: [] },
      sender
    );
    server.handle(
      { v: PROTOCOL_VERSION, kind: 'request', id: 7, method: 'GET', url: '/a', headers: [] },
      sender
    );
    const errs = outbox.filter((f) => f.kind === 'response.error');
    expect(errs.length).toBeGreaterThanOrEqual(1);
    expect((errs[0] as { code?: string }).code).toBe('duplicate-id');
  });

  it('emits response.error{code: internal} when ApiServer throws', async () => {
    const api = makeApiServer(() => {
      throw new Error('boom');
    });
    const { server, outbox } = makeServer(api);
    const sender = makeSender(outbox);

    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request',
        id: 3,
        method: 'GET',
        url: '/explode',
        headers: [],
      },
      sender
    );
    await flush();

    const err = outbox.find((f) => f.kind === 'response.error') as
      | { kind: 'response.error'; id: number; code: string }
      | undefined;
    expect(err?.code).toBe('internal');
    expect(err?.id).toBe(3);
  });

  it('drops hub-emitted response.* frames coming back from a misbehaving peer', () => {
    const { server, outbox } = makeServer(makeApiServer(() => new Response()));
    const sender = makeSender(outbox);

    for (const kind of [
      'response.head',
      'response.chunk',
      'response.end',
      'response.error',
    ] as const) {
      // Each branch needs the right minimum shape — handle() only switches on kind.
      const frame = { v: PROTOCOL_VERSION, kind, id: 1 } as unknown as RpcMessage;
      server.handle(frame, sender);
    }
    expect(outbox).toEqual([]);
  });

  it('abort on an unknown id is a no-op', () => {
    const { server, outbox } = makeServer(makeApiServer(() => new Response()));
    const sender = makeSender(outbox);
    server.handle({ v: PROTOCOL_VERSION, kind: 'abort', id: 999 }, sender);
    expect(outbox).toEqual([]);
  });

  it('shutdown aborts all in-flight requests', async () => {
    // Never-resolving upstream — shutdown is what surfaces the abort.
    const api = makeApiServer(() => new Promise<Response>(() => undefined));
    const { server, outbox } = makeServer(api);
    const sender = makeSender(outbox);

    server.handle(
      { v: PROTOCOL_VERSION, kind: 'request', id: 1, method: 'GET', url: '/x', headers: [] },
      sender
    );
    server.handle(
      { v: PROTOCOL_VERSION, kind: 'request', id: 2, method: 'GET', url: '/y', headers: [] },
      sender
    );

    server.shutdown();
    // After shutdown the inflight map is empty; another request with id=1 succeeds.
    server.handle(
      { v: PROTOCOL_VERSION, kind: 'request', id: 1, method: 'GET', url: '/z', headers: [] },
      sender
    );
    await flush();

    const duplicates = outbox.filter(
      (f) => f.kind === 'response.error' && (f as { code?: string }).code === 'duplicate-id'
    );
    expect(duplicates).toEqual([]);
  });

  it('stamps x-brika-transport: rtc on every synthesized request', async () => {
    const seen: Request[] = [];
    const { server, outbox } = makeServer(
      makeApiServer((req) => {
        seen.push(req);
        return new Response('ok');
      })
    );
    const sender = makeSender(outbox);

    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request',
        id: 1,
        method: 'GET',
        url: '/api/anything',
        headers: [],
      },
      sender
    );
    await flush();

    expect(seen[0]?.headers.get('x-brika-transport')).toBe('rtc');
  });

  it('overrides the user-agent header with the coordinator-captured value', async () => {
    const seen: Request[] = [];
    const apiServer = {
      fetchInternal: (req: Request) => {
        seen.push(req);
        return Promise.resolve(new Response('ok'));
      },
    } as unknown as ApiServer;
    const outbox: RpcMessage[] = [];
    const server = new RpcServer({
      sessionId: 'sess-ua',
      baseOrigin: 'https://hub.local',
      apiServer,
      remoteIp: '203.0.113.1',
      remoteUserAgent: 'CoordinatorCapturedUA/1.0',
      log: silentLog,
    });
    const sender = makeSender(outbox);

    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request',
        id: 1,
        method: 'GET',
        url: '/api/x',
        // Page bridge forwards a UA the page could've rewritten.
        headers: [['user-agent', 'PageForwardedUA/0.0']],
      },
      sender
    );
    await flush();

    expect(seen[0]?.headers.get('user-agent')).toBe('CoordinatorCapturedUA/1.0');
  });

  it('reassembles a chunked upload body and passes it to fetchInternal', async () => {
    const seen: Request[] = [];
    const { server, outbox } = makeServer(
      makeApiServer(async (req) => {
        seen.push(req);
        // Consume the body fully so the assembler's stream is drained.
        const bytes = new Uint8Array(await req.arrayBuffer());
        return new Response(JSON.stringify({ size: bytes.byteLength }), {
          headers: { 'content-type': 'application/json' },
        });
      })
    );
    const sender = makeSender(outbox);

    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request',
        id: 42,
        method: 'PUT',
        url: '/api/upload',
        headers: [['content-type', 'application/octet-stream']],
        hasBody: true,
      },
      sender
    );
    // Two binary chunks then end.
    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request.chunk',
        id: 42,
        dataB64: btoa(String.fromCodePoint(1, 2, 3, 4)),
      },
      sender
    );
    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request.chunk',
        id: 42,
        dataB64: btoa(String.fromCodePoint(5, 6, 7, 8)),
      },
      sender
    );
    server.handle({ v: PROTOCOL_VERSION, kind: 'request.end', id: 42 }, sender);
    await flush();

    expect(seen.length).toBe(1);
    expect(seen[0]?.method).toBe('PUT');
    // The dispatcher started reading before request.end arrived (streaming
    // body), but the consumer in this test fully drains the body — so the
    // resolved Response reports the full byte count.
    const head = outbox.find((f) => f.kind === 'response.head') as
      | { kind: 'response.head'; status: number }
      | undefined;
    expect(head?.status).toBe(200);
  });

  it('reassembles a binary-frame upload routed through onBinaryChunk', async () => {
    const seen: Uint8Array[] = [];
    const { server, outbox } = makeServer(
      makeApiServer(async (req) => {
        seen.push(new Uint8Array(await req.arrayBuffer()));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json' },
        });
      })
    );
    const sender = makeSender(outbox);

    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request',
        id: 100,
        method: 'PUT',
        url: '/api/upload',
        headers: [['content-type', 'application/octet-stream']],
        hasBody: true,
      },
      sender
    );
    // Synthesized binary chunks — same shape the PeerSession builds from a
    // decoded binary frame, routed through the same `request.chunk` arm.
    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request.chunk',
        id: 100,
        dataBin: new Uint8Array([1, 2, 3]),
      },
      sender
    );
    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request.chunk',
        id: 100,
        dataBin: new Uint8Array([4, 5]),
      },
      sender
    );
    server.handle({ v: PROTOCOL_VERSION, kind: 'request.end', id: 100 }, sender);
    await flush();

    expect(seen.length).toBe(1);
    expect(Array.from(seen[0] ?? new Uint8Array())).toEqual([1, 2, 3, 4, 5]);
  });

  it('streams response.chunk as binary when the peer advertised binary-frames', async () => {
    const bodyBytes = new Uint8Array([10, 20, 30, 40, 50]);
    const { server, outbox } = makeServer(
      makeApiServer(
        () =>
          new Response(bodyBytes, {
            status: 200,
            headers: { 'content-type': 'application/octet-stream' },
          })
      )
    );
    const binaryOutbox: BinaryOut[] = [];
    const sender = makeSender(outbox, { binaryOutbox, peerSupportsBinary: true });

    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request',
        id: 200,
        method: 'GET',
        url: '/api/download',
        headers: [],
      },
      sender
    );
    await flush();

    // JSON frames: head + end only — body went out-of-band via the binary callback.
    expect(outbox.map((f) => f.kind)).toEqual(['response.head', 'response.end']);
    const concatenated = binaryOutbox.flatMap((b) => Array.from(b.bytes));
    expect(concatenated).toEqual([10, 20, 30, 40, 50]);
    expect(binaryOutbox.every((b) => b.kind === 'response.chunk' && b.id === 200)).toBe(true);
  });

  it('falls back to JSON dataB64 chunks when peer omits the binary-frames cap', async () => {
    const { server, outbox } = makeServer(
      makeApiServer(
        () =>
          new Response(new Uint8Array([99, 100, 101]), {
            status: 200,
            headers: { 'content-type': 'application/octet-stream' },
          })
      )
    );
    const binaryOutbox: BinaryOut[] = [];
    // peerSupportsBinary defaults to false — exercises the legacy path.
    const sender = makeSender(outbox, { binaryOutbox });

    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request',
        id: 201,
        method: 'GET',
        url: '/api/legacy',
        headers: [],
      },
      sender
    );
    await flush();

    expect(binaryOutbox).toHaveLength(0);
    const chunks = outbox.filter((f) => f.kind === 'response.chunk');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => typeof (c as { dataB64?: string }).dataB64 === 'string')).toBe(true);
  });

  it('replies with response.error{code: body-too-large, status: 413} when an upload exceeds maxRequestBodyBytes', async () => {
    const outbox: RpcMessage[] = [];
    const apiServer = {
      // Drain the body so the assembler's stream raises the typed error.
      fetchInternal: async (req: Request) => {
        await req.arrayBuffer();
        return new Response('unreachable');
      },
    } as unknown as ApiServer;
    const server = new RpcServer({
      sessionId: 'sess-cap',
      baseOrigin: 'https://hub.local',
      apiServer,
      remoteIp: '203.0.113.1',
      // 10-byte cap so the second chunk overflows.
      maxRequestBodyBytes: 10,
      log: silentLog,
    });
    const sender = makeSender(outbox);

    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request',
        id: 9,
        method: 'POST',
        url: '/api/upload',
        headers: [['content-type', 'application/octet-stream']],
        hasBody: true,
      },
      sender
    );
    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request.chunk',
        id: 9,
        dataText: 'abcdef',
      },
      sender
    );
    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request.chunk',
        id: 9,
        dataText: 'ghijkl', // total 12 > 10 → trips the cap.
      },
      sender
    );
    server.handle({ v: PROTOCOL_VERSION, kind: 'request.end', id: 9 }, sender);
    await flush();

    const errFrame = outbox.find((f) => f.kind === 'response.error') as
      | { kind: 'response.error'; code: string; status?: number }
      | undefined;
    expect(errFrame?.code).toBe('body-too-large');
    expect(errFrame?.status).toBe(413);
    // No response.head was emitted — the cap fired before dispatch returned a Response.
    expect(outbox.some((f) => f.kind === 'response.head')).toBe(false);
  });

  it('leaves the page-forwarded user-agent intact when no remoteUserAgent is configured', async () => {
    const seen: Request[] = [];
    const { server, outbox } = makeServer(
      makeApiServer((req) => {
        seen.push(req);
        return new Response('ok');
      })
    );
    const sender = makeSender(outbox);

    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request',
        id: 1,
        method: 'GET',
        url: '/api/y',
        headers: [['user-agent', 'PageForwardedUA/1.0']],
      },
      sender
    );
    await flush();

    expect(seen[0]?.headers.get('user-agent')).toBe('PageForwardedUA/1.0');
  });
});
