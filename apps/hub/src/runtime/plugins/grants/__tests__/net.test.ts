/**
 * Unit tests for the hub-side `net.fetch` grant handler. Exercises the
 * host allow-list enforcement, scope re-parse, and the registry dispatch
 * shape end-to-end (registry → handler → grant denial path).
 */

import { describe, expect, test } from 'bun:test';
import { BrikaError } from '@brika/errors';
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
    const reg = buildHubGrants(fetcher);

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
    const reg = buildHubGrants(fetcher);

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
    const reg = buildHubGrants(fetcher);

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
    const reg = buildHubGrants(fetcher);

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
    const reg = buildHubGrants(fetcher);

    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error('test abort')), 50);
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
    const reg = buildHubGrants(fetcher);

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
});
