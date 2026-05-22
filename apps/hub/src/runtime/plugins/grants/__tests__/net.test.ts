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

const handlerCtx = (scope: unknown) => ({
  pluginUid: 'plug-1',
  pluginRoot: '/tmp/plugin',
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

  test('denied host throws PERMISSION_DENIED — no fetch invoked', async () => {
    const fetcher = mockFetcher(() => new Response('', { status: 200 }));
    const reg = buildHubGrants(fetcher);

    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch(
        'dev.brika.net.fetch',
        { url: 'https://attacker.example/leak', method: 'GET' },
        handlerCtx({ allow: ['api.example.com'] })
      );
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown).toBeInstanceOf(BrikaError);
    expect(thrown?.code).toBe('PERMISSION_DENIED');
    expect(fetcher.calls).toHaveLength(0);
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
    expect(thrown?.code).toBe('PERMISSION_DENIED');
    expect(fetcher.calls).toHaveLength(1);
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
