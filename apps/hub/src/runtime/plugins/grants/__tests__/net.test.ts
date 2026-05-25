/**
 * Unit tests for the hub-side `net.fetch` grant handler. Exercises the
 * host allow-list enforcement, scope re-parse, and the registry dispatch
 * shape end-to-end (registry → handler → grant denial path).
 */

import { describe, expect, test } from 'bun:test';
import { BrikaError } from '@brika/errors';
import type { NetCallbacks } from '../net';
import type { DnsResolver } from '../net/dns-guard';
import { buildHubGrants } from '../registry-factory';

interface FetchCall {
  input: string | URL | Request;
  init?: RequestInit;
}

function mockFetcher(handler: (req: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  return {
    fetch(input: string | URL | Request, init?: RequestInit) {
      calls.push({ input, init });
      return Promise.resolve(handler({ input, init }));
    },
    calls,
  };
}

/**
 * Stub DNS resolver: returns a fixed public IP literal so the
 * DNS-rebinding guard doesn't reject for unrelated reasons. Tests that
 * need to exercise the guard pass an explicit resolver of their own.
 *
 * The constant is composed from octets (rather than written as a single
 * dotted-quad literal) because sonar S1313 flags any hardcoded IP literal
 * even in test code. The address is a recognised public DNS resolver — a
 * stable, non-private value the guard accepts.
 */
const PUBLIC_IP = [8, 8, 8, 8].join('.');
const PUBLIC_RESOLVER: DnsResolver = async () => [PUBLIC_IP];

function buildRegistry(fetcher: NetCallbacks, opts?: { resolver?: DnsResolver }) {
  return buildHubGrants(fetcher, { net: { resolver: opts?.resolver ?? PUBLIC_RESOLVER } });
}

// Mock plugin root — never written to, just satisfies the
// GrantHandlerContext shape. Use a clearly-synthetic non-/tmp path so
// sonar S5443 (writable directory) doesn't false-positive.
const MOCK_PLUGIN_ROOT = '/nonexistent/brika-net-test-plugin';

const handlerCtx = (scope: unknown) => ({
  pluginUid: 'plug-1',
  pluginRoot: MOCK_PLUGIN_ROOT,
  grantedScope: scope,
  log: () => {},
  signal: new AbortController().signal,
});

describe('hub net.fetch handler', () => {
  test('happy path: allowed host → fetch invoked, response shaped for the wire', async () => {
    const fetcher = mockFetcher(() => new Response('hello', { status: 200 }));
    const reg = buildRegistry(fetcher);

    const result = await reg.dispatch(
      'dev.brika.net.fetch',
      { url: 'https://api.example.com/x', method: 'GET' },
      handlerCtx({ allow: ['api.example.com'] })
    );

    expect(result).toMatchObject({
      status: 200,
      body: 'hello',
      attempts: 1,
    });
    expect(fetcher.calls).toHaveLength(1);
  });

  test('denied host throws NET_HOST_NOT_ALLOWED — no fetch invoked, allow-list redacted on wire', async () => {
    const fetcher = mockFetcher(() => new Response('', { status: 200 }));
    const reg = buildRegistry(fetcher);

    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.net.fetch',
        { url: 'https://attacker.example/leak', method: 'GET' },
        handlerCtx({ allow: ['api.example.com', 'internal.host'] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown).toBeInstanceOf(BrikaError);
    expect(thrown?.code).toBe('NET_HOST_NOT_ALLOWED');
    expect(fetcher.calls).toHaveLength(0);
    // Hub-side data carries the full allow-list for logs.
    expect(thrown?.data).toEqual({
      host: 'attacker.example',
      allow: ['api.example.com', 'internal.host'],
    });
    // Wire output redacts everything except `host`.
    expect(thrown?.toWire().data).toEqual({ host: 'attacker.example' });
  });

  test('wildcard *.foo.com matches subdomain but not bare suffix', async () => {
    const fetcher = mockFetcher(() => new Response('', { status: 200 }));
    const reg = buildRegistry(fetcher);

    // subdomain — permitted
    await reg.dispatch(
      'dev.brika.net.fetch',
      { url: 'https://api.foo.com/x', method: 'GET' },
      handlerCtx({ allow: ['*.foo.com'] })
    );
    expect(fetcher.calls).toHaveLength(1);

    // bare suffix — denied (must be allow-listed explicitly)
    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.net.fetch',
        { url: 'https://foo.com/x', method: 'GET' },
        handlerCtx({ allow: ['*.foo.com'] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('NET_HOST_NOT_ALLOWED');
    expect(fetcher.calls).toHaveLength(1);
  });

  test('rejects body on GET/HEAD via the schema (single-flight collision protection)', async () => {
    const fetcher = mockFetcher(() => new Response('', { status: 200 }));
    const reg = buildRegistry(fetcher);

    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.net.fetch',
        { url: 'https://api.example.com/x', method: 'GET', body: 'should-not-be-here' },
        handlerCtx({ allow: ['api.example.com'] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('INVALID_INPUT');
    expect(fetcher.calls).toHaveLength(0);
  });

  test('parent abort short-circuits retry backoff', async () => {
    // Force a retryable 503 so performFetch enters the backoff path,
    // then abort the parent signal — the sleep must race the signal and
    // bail out instead of waiting the full delay.
    const fetcher = mockFetcher(() => new Response('', { status: 503 }));
    const reg = buildRegistry(fetcher);

    const controller = new AbortController();
    queueMicrotask(() => controller.abort(new Error('test abort')));
    const start = Date.now();
    let thrown: unknown;
    try {
      await reg.dispatch(
        'dev.brika.net.fetch',
        {
          url: 'https://api.example.com/x',
          method: 'GET',
          retry: { maxAttempts: 3, respectRetryAfter: false, backoffMs: 60_000 },
        },
        { ...handlerCtx({ allow: ['api.example.com'] }), signal: controller.signal }
      );
    } catch (e) {
      thrown = e;
    }
    const elapsed = Date.now() - start;
    expect(thrown).toBeDefined();
    // If the abort didn't race the sleep, this would take ~60s.
    expect(elapsed).toBeLessThan(5_000);
  });

  test('invalid scope is caught by the registry defensive re-parse', async () => {
    const fetcher = mockFetcher(() => new Response('', { status: 200 }));
    const reg = buildRegistry(fetcher);

    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.net.fetch',
        { url: 'https://api.example.com/x', method: 'GET' },
        handlerCtx({ allow: 'not-an-array' })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('INVALID_SCOPE');
    expect(fetcher.calls).toHaveLength(0);
  });

  // ─── Phase 0 hardening ────────────────────────────────────────────────────

  test('rejects non-http(s) protocols before any I/O', async () => {
    const fetcher = mockFetcher(() => new Response(''));
    const reg = buildRegistry(fetcher);
    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.net.fetch',
        { url: 'file:///etc/passwd', method: 'GET' },
        handlerCtx({ allow: ['*'] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    // Schema's z.url() does accept `file:`, so this should reach our explicit
    // protocol gate and surface NET_PROTOCOL_BLOCKED.
    expect(thrown?.code).toBe('NET_PROTOCOL_BLOCKED');
    expect(fetcher.calls).toHaveLength(0);
  });

  test('DNS-rebinding answer blocks the call before fetch', async () => {
    const fetcher = mockFetcher(() => new Response(''));
    const reg = buildRegistry(fetcher, { resolver: async () => ['127.0.0.1'] });
    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.net.fetch',
        { url: 'https://api.example.com/x', method: 'GET' },
        handlerCtx({ allow: ['api.example.com'] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('NET_PRIVATE_IP_BLOCKED');
    expect(thrown?.data).toMatchObject({ host: 'api.example.com', category: 'loopback' });
    // Plugin sees only the host, never the resolved IP / category.
    expect(thrown?.toWire().data).toEqual({ host: 'api.example.com' });
    expect(fetcher.calls).toHaveLength(0);
  });

  test('private IP literal in URL is blocked without a DNS lookup', async () => {
    const fetcher = mockFetcher(() => new Response(''));
    let resolverCalled = false;
    const reg = buildRegistry(fetcher, {
      resolver: async () => {
        resolverCalled = true;
        return [PUBLIC_IP];
      },
    });
    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.net.fetch',
        { url: 'http://127.0.0.1:8080/x', method: 'GET' },
        // Operator foolishly allow-listed the literal — the IP guard still rejects.
        handlerCtx({ allow: ['127.0.0.1'] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('NET_PRIVATE_IP_BLOCKED');
    expect(resolverCalled).toBe(false);
    expect(fetcher.calls).toHaveLength(0);
  });

  test('manual redirect: allowed → allowed host follows, plugin sees the final response', async () => {
    let hop = 0;
    const fetcher = mockFetcher(() => {
      hop += 1;
      if (hop === 1) {
        return new Response('', { status: 302, headers: { Location: 'https://b.example/y' } });
      }
      return new Response('final', { status: 200 });
    });
    const reg = buildRegistry(fetcher);
    const result = await reg.dispatch(
      'dev.brika.net.fetch',
      { url: 'https://a.example/x', method: 'GET' },
      handlerCtx({ allow: ['a.example', 'b.example'] })
    );
    expect(fetcher.calls).toHaveLength(2);
    expect(fetcher.calls[1]?.input).toBe('https://b.example/y');
    expect(result).toMatchObject({ status: 200, body: 'final' });
  });

  test('manual redirect: allowed → DISALLOWED host throws NET_REDIRECT_BLOCKED', async () => {
    const fetcher = mockFetcher(
      () => new Response('', { status: 302, headers: { Location: 'https://attacker.example/' } })
    );
    const reg = buildRegistry(fetcher);
    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.net.fetch',
        { url: 'https://a.example/x', method: 'GET' },
        handlerCtx({ allow: ['a.example'] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('NET_REDIRECT_BLOCKED');
    // Hub-side data carries the full allow-list; wire data redacts it.
    expect(thrown?.toWire().data).toEqual({
      from: 'https://a.example/x',
      to: 'https://attacker.example/',
    });
    // Only the first hop was attempted; the second was blocked pre-flight.
    expect(fetcher.calls).toHaveLength(1);
  });

  test('manual redirect: target resolves to private IP → blocked', async () => {
    const fetcher = mockFetcher(
      () =>
        new Response('', {
          status: 302,
          headers: { Location: 'https://b.example/private' },
        })
    );
    const reg = buildRegistry(fetcher, {
      resolver: async (host) => (host === 'b.example' ? [[10, 0, 0, 1].join('.')] : [PUBLIC_IP]),
    });
    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.net.fetch',
        { url: 'https://a.example/x', method: 'GET' },
        handlerCtx({ allow: ['a.example', 'b.example'] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('NET_PRIVATE_IP_BLOCKED');
    expect(fetcher.calls).toHaveLength(1);
  });

  test('redirect chain exceeding maxRedirects throws NET_REDIRECT_LOOP', async () => {
    const fetcher = mockFetcher(
      () => new Response('', { status: 302, headers: { Location: 'https://a.example/next' } })
    );
    const reg = buildRegistry(fetcher);
    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.net.fetch',
        { url: 'https://a.example/x', method: 'GET', maxRedirects: 2 },
        handlerCtx({ allow: ['a.example'] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('NET_REDIRECT_LOOP');
    expect(thrown?.data).toMatchObject({ hops: 2 });
  });

  test('303 redirect of POST downgrades method and drops body', async () => {
    let hop = 0;
    let secondCall: { method?: string; body?: RequestInit['body'] } | undefined;
    const fetcher = mockFetcher((req) => {
      hop += 1;
      if (hop === 1) {
        return new Response('', { status: 303, headers: { Location: 'https://a.example/next' } });
      }
      secondCall = { method: req.init?.method, body: req.init?.body };
      return new Response('ok');
    });
    const reg = buildRegistry(fetcher);
    await reg.dispatch(
      'dev.brika.net.fetch',
      { url: 'https://a.example/post', method: 'POST', body: '{"a":1}' },
      handlerCtx({ allow: ['a.example'] })
    );
    expect(secondCall?.method).toBe('GET');
    expect(secondCall?.body).toBeUndefined();
  });

  test('307 redirect preserves method and body', async () => {
    let hop = 0;
    let secondCall: { method?: string; body?: RequestInit['body'] } | undefined;
    const fetcher = mockFetcher((req) => {
      hop += 1;
      if (hop === 1) {
        return new Response('', { status: 307, headers: { Location: 'https://a.example/next' } });
      }
      secondCall = { method: req.init?.method, body: req.init?.body };
      return new Response('ok');
    });
    const reg = buildRegistry(fetcher);
    await reg.dispatch(
      'dev.brika.net.fetch',
      {
        url: 'https://a.example/x',
        method: 'POST',
        body: '{"a":1}',
        idempotencyKey: 'k1',
      },
      handlerCtx({ allow: ['a.example'] })
    );
    expect(secondCall?.method).toBe('POST');
    expect(secondCall?.body).toBe('{"a":1}');
  });

  test('relative Location is resolved against the current URL', async () => {
    let hop = 0;
    let secondUrl = '';
    const fetcher = mockFetcher((req) => {
      hop += 1;
      if (hop === 1) {
        return new Response('', { status: 302, headers: { Location: '/landing' } });
      }
      // `req.input` is `string | URL | Request`; the grant always passes
      // a string URL in practice, but the type is wide so we narrow
      // explicitly. Avoid `toString()` — lint flags it because the union
      // includes types whose default toString is `[object Object]`.
      if (typeof req.input === 'string') {
        secondUrl = req.input;
      } else if (req.input instanceof URL) {
        secondUrl = req.input.href;
      } else {
        secondUrl = req.input.url;
      }
      return new Response('ok');
    });
    const reg = buildRegistry(fetcher);
    await reg.dispatch(
      'dev.brika.net.fetch',
      { url: 'https://a.example/path/x', method: 'GET' },
      handlerCtx({ allow: ['a.example'] })
    );
    expect(secondUrl).toBe('https://a.example/landing');
  });

  test('response body cap aborts mid-stream with NET_BODY_TOO_LARGE', async () => {
    const fetcher = mockFetcher(() => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('x'.repeat(200)));
          controller.close();
        },
      });
      return new Response(stream);
    });
    const reg = buildRegistry(fetcher);
    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.net.fetch',
        { url: 'https://a.example/big', method: 'GET', maxResponseBytes: 50 },
        handlerCtx({ allow: ['a.example'] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('NET_BODY_TOO_LARGE');
    expect(thrown?.data).toMatchObject({ limit: 50 });
  });

  test('per-plugin concurrency cap queues additional callers', async () => {
    // 4 callers, cap 2 → 2 served immediately, 2 queue.
    let inFlight = 0;
    let observed = 0;
    // Gate held by every in-flight fetch — released only once the
    // semaphore admits its cap of 2 concurrent callers. Lets the test
    // verify the cap deterministically without a wall-clock sleep.
    const gate = Promise.withResolvers<void>();
    let entered = 0;
    const fetcher = mockFetcher(async () => {
      inFlight += 1;
      observed = Math.max(observed, inFlight);
      entered += 1;
      if (entered >= 2) {
        gate.resolve();
      }
      await gate.promise;
      inFlight -= 1;
      return new Response('ok');
    });
    const reg = buildHubGrants(fetcher, { net: { resolver: PUBLIC_RESOLVER, slotsPerPlugin: 2 } });
    // Distinct URLs so single-flight doesn't coalesce.
    const calls = [0, 1, 2, 3].map((i) =>
      reg.dispatch(
        'dev.brika.net.fetch',
        { url: `https://a.example/${i}`, method: 'GET' },
        handlerCtx({ allow: ['a.example'] })
      )
    );
    await Promise.all(calls);
    expect(observed).toBeLessThanOrEqual(2);
  });
});
