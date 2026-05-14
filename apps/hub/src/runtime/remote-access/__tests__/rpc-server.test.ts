import { describe, expect, it } from 'bun:test';
import {
  PROTOCOL_VERSION,
  type RpcMessage,
  type RpcMessageKind,
} from '@brika/remote-access-protocol';
import type { ApiServer } from '@/runtime/http/api-server';
import { RpcServer } from '../rpc-server';
import type { SignalingLogger } from '../signaling-client';

const silentLog: SignalingLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

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
    const send = (frame: RpcMessage) => outbox.push(frame);
    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'hello',
        role: 'client',
        softwareVersion: 'test',
        maxProtocolVersion: PROTOCOL_VERSION,
      },
      send
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
    const send = (frame: RpcMessage) => outbox.push(frame);

    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request',
        id: 1,
        method: 'GET',
        url: '/api/health',
        headers: [['accept', 'text/plain']],
      },
      send
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
    const api = makeApiServer(
      () => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response('ok')), 50))
    );
    const { server, outbox } = makeServer(api);
    const send = (frame: RpcMessage) => outbox.push(frame);

    server.handle(
      { v: PROTOCOL_VERSION, kind: 'request', id: 7, method: 'GET', url: '/a', headers: [] },
      send
    );
    server.handle(
      { v: PROTOCOL_VERSION, kind: 'request', id: 7, method: 'GET', url: '/a', headers: [] },
      send
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
    const send = (frame: RpcMessage) => outbox.push(frame);

    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request',
        id: 3,
        method: 'GET',
        url: '/explode',
        headers: [],
      },
      send
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
    const send = (frame: RpcMessage) => outbox.push(frame);

    for (const kind of [
      'response.head',
      'response.chunk',
      'response.end',
      'response.error',
    ] as const) {
      // Each branch needs the right minimum shape — handle() only switches on kind.
      const frame = { v: PROTOCOL_VERSION, kind, id: 1 } as unknown as RpcMessage;
      server.handle(frame, send);
    }
    expect(outbox).toEqual([]);
  });

  it('abort on an unknown id is a no-op', () => {
    const { server, outbox } = makeServer(makeApiServer(() => new Response()));
    const send = (frame: RpcMessage) => outbox.push(frame);
    server.handle({ v: PROTOCOL_VERSION, kind: 'abort', id: 999 }, send);
    expect(outbox).toEqual([]);
  });

  it('shutdown aborts all in-flight requests', async () => {
    const api = makeApiServer(
      () => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response('ok')), 500))
    );
    const { server, outbox } = makeServer(api);
    const send = (frame: RpcMessage) => outbox.push(frame);

    server.handle(
      { v: PROTOCOL_VERSION, kind: 'request', id: 1, method: 'GET', url: '/x', headers: [] },
      send
    );
    server.handle(
      { v: PROTOCOL_VERSION, kind: 'request', id: 2, method: 'GET', url: '/y', headers: [] },
      send
    );

    server.shutdown();
    // After shutdown the inflight map is empty; another request with id=1 succeeds.
    server.handle(
      { v: PROTOCOL_VERSION, kind: 'request', id: 1, method: 'GET', url: '/z', headers: [] },
      send
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
    const send = (frame: RpcMessage) => outbox.push(frame);

    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request',
        id: 1,
        method: 'GET',
        url: '/api/anything',
        headers: [],
      },
      send
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
    const send = (frame: RpcMessage) => outbox.push(frame);

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
      send
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
    const send = (frame: RpcMessage) => outbox.push(frame);

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
      send
    );
    // Two binary chunks then end.
    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request.chunk',
        id: 42,
        dataB64: btoa(String.fromCodePoint(1, 2, 3, 4)),
      },
      send
    );
    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request.chunk',
        id: 42,
        dataB64: btoa(String.fromCodePoint(5, 6, 7, 8)),
      },
      send
    );
    server.handle({ v: PROTOCOL_VERSION, kind: 'request.end', id: 42 }, send);
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

  it('leaves the page-forwarded user-agent intact when no remoteUserAgent is configured', async () => {
    const seen: Request[] = [];
    const { server, outbox } = makeServer(
      makeApiServer((req) => {
        seen.push(req);
        return new Response('ok');
      })
    );
    const send = (frame: RpcMessage) => outbox.push(frame);

    server.handle(
      {
        v: PROTOCOL_VERSION,
        kind: 'request',
        id: 1,
        method: 'GET',
        url: '/api/y',
        headers: [['user-agent', 'PageForwardedUA/1.0']],
      },
      send
    );
    await flush();

    expect(seen[0]?.headers.get('user-agent')).toBe('PageForwardedUA/1.0');
  });
});
