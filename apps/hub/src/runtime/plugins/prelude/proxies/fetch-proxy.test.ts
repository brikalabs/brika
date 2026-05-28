/**
 * Unit tests for the global `fetch` proxy.
 *
 * Builds two `Channel` instances connected in a loopback so the proxy
 * dispatches over real IPC plumbing without a hub process. The hub-side
 * channel registers a `grantRequest` handler that replays canned
 * responses, letting tests verify the proxy's input translation and
 * response shaping end-to-end.
 */

import { describe, expect, test } from 'bun:test';
import { Channel, type WireMessage } from '@brika/ipc';
import { grantRequest } from '@brika/ipc/contract';
import { FetchArgsSchema } from '@brika/sdk/grants';
import { buildFetchProxy } from './fetch-proxy';

interface GrantCall {
  id: string;
  args: ReturnType<typeof FetchArgsSchema.parse>;
}

function loopback(handler: (call: GrantCall) => unknown): {
  pluginChan: Channel;
  hubChan: Channel;
  calls: GrantCall[];
} {
  let pluginChan!: Channel;
  let hubChan!: Channel;
  pluginChan = new Channel({
    send: (m: WireMessage) => {
      // Defer to next tick so we don't recurse the call stack.
      queueMicrotask(() => hubChan.handle(m).catch(() => undefined));
    },
  });
  hubChan = new Channel({
    send: (m: WireMessage) => {
      queueMicrotask(() => pluginChan.handle(m).catch(() => undefined));
    },
  });
  const calls: GrantCall[] = [];
  // grantRequest's args field is wire-untyped (`unknown` in the contract)
  // because each grant validates its own shape on the hub side. We
  // re-parse with FetchArgsSchema here so the test assertions narrow to
  // the concrete shape without a type assertion.
  hubChan.implement(grantRequest, async (req) => {
    const parsed: GrantCall = { id: req.id, args: FetchArgsSchema.parse(req.args) };
    calls.push(parsed);
    return { result: handler(parsed) };
  });
  return { pluginChan, hubChan, calls };
}

const GRANT_ID = 'dev.brika.net.fetch';
const okResult = (body = 'hi', extra: Record<string, unknown> = {}) => ({
  status: 200,
  statusText: 'OK',
  headers: { 'content-type': 'text/plain' },
  body,
  attempts: 1,
  ...extra,
});

describe('buildFetchProxy', () => {
  test('GET string url translates and unwraps into a Response', async () => {
    const { pluginChan, calls } = loopback(() => okResult('hello'));
    const fetch = buildFetchProxy({ channel: pluginChan });
    const res = await fetch('https://api.example.com/x');
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.id).toBe(GRANT_ID);
    expect(calls[0]?.args.method).toBe('GET');
    expect(calls[0]?.args.url).toBe('https://api.example.com/x');
  });

  test('URL instance input', async () => {
    const { pluginChan, calls } = loopback(() => okResult());
    const fetch = buildFetchProxy({ channel: pluginChan });
    await fetch(new URL('https://api.example.com/path?q=1'));
    expect(calls[0]?.args.url).toBe('https://api.example.com/path?q=1');
  });

  test('init.method overrides default GET', async () => {
    const { pluginChan, calls } = loopback(() => okResult());
    const fetch = buildFetchProxy({ channel: pluginChan });
    await fetch('https://api.example.com/x', { method: 'post', body: '{}' });
    expect(calls[0]?.args.method).toBe('POST');
    expect(calls[0]?.args.body).toBe('{}');
  });

  test('Request instance input — headers and body flow through; init wins on method', async () => {
    const { pluginChan, calls } = loopback(() => okResult());
    const fetch = buildFetchProxy({ channel: pluginChan });
    const req = new Request('https://api.example.com/y', {
      method: 'POST',
      headers: { 'X-Custom': 'value' },
      body: '{"a":1}',
    });
    await fetch(req, { method: 'PATCH' });
    expect(calls[0]?.args.method).toBe('PATCH');
    expect(calls[0]?.args.headers?.['x-custom']).toBe('value');
    expect(calls[0]?.args.body).toBe('{"a":1}');
  });

  test('headers from Headers, array, and plain object — all normalised', async () => {
    const { pluginChan, calls } = loopback(() => okResult());
    const fetch = buildFetchProxy({ channel: pluginChan });

    await fetch('https://api.example.com/h1', { headers: { 'X-A': '1' } });
    expect(calls[0]?.args.headers).toEqual({ 'X-A': '1' });

    await fetch('https://api.example.com/h2', { headers: [['X-B', '2']] });
    expect(calls[1]?.args.headers).toEqual({ 'X-B': '2' });

    await fetch('https://api.example.com/h3', { headers: new Headers({ 'X-C': '3' }) });
    expect(calls[2]?.args.headers).toEqual({ 'x-c': '3' });
  });

  test('GET with body drops the body (RFC 7231 — GET has no body)', async () => {
    const { pluginChan, calls } = loopback(() => okResult());
    const fetch = buildFetchProxy({ channel: pluginChan });
    // sonar S7733 (and our schema) flag `{method: 'GET', body}` as
    // illegal; we deliberately pass it via a typed bag to verify the
    // proxy strips the body BEFORE the call reaches the schema, so
    // plugins that accidentally pass a body on GET don't get an
    // INVALID_INPUT error from the grant.
    const badInit: RequestInit = { method: 'GET' };
    Object.assign(badInit, { body: 'ignored' });
    await fetch('https://api.example.com/x', badInit);
    expect(calls[0]?.args.body).toBeUndefined();
  });

  test('URLSearchParams body coerces to its serialised form', async () => {
    const { pluginChan, calls } = loopback(() => okResult());
    const fetch = buildFetchProxy({ channel: pluginChan });
    const params = new URLSearchParams({ a: '1', b: '2' });
    await fetch('https://api.example.com/x', { method: 'POST', body: params });
    expect(calls[0]?.args.body).toBe('a=1&b=2');
  });

  test('Uint8Array body decodes via TextDecoder', async () => {
    const { pluginChan, calls } = loopback(() => okResult());
    const fetch = buildFetchProxy({ channel: pluginChan });
    const bytes = new TextEncoder().encode('binary');
    await fetch('https://api.example.com/x', { method: 'POST', body: bytes });
    expect(calls[0]?.args.body).toBe('binary');
  });

  test('Unsupported method throws synchronously with a clear message', async () => {
    const { pluginChan } = loopback(() => okResult());
    const fetch = buildFetchProxy({ channel: pluginChan });
    await expect(fetch('https://api.example.com/x', { method: 'PROPFIND' })).rejects.toThrow(
      /unsupported method "PROPFIND"/
    );
  });

  test('Unmodeled init options trigger onUnmodeled once per key', async () => {
    const { pluginChan } = loopback(() => okResult());
    const seen: string[] = [];
    const fetch = buildFetchProxy({
      channel: pluginChan,
      onUnmodeled: (key) => seen.push(key),
    });
    await fetch('https://api.example.com/x', { credentials: 'include', mode: 'cors' });
    await fetch('https://api.example.com/y', { credentials: 'include', cache: 'no-store' });
    // `credentials` appears twice but should only fire one notice.
    expect(seen.toSorted((a, b) => a.localeCompare(b))).toEqual(['cache', 'credentials', 'mode']);
  });

  test('exposes a preconnect no-op so `typeof fetch` consumers do not break', () => {
    const { pluginChan } = loopback(() => okResult());
    const fetch = buildFetchProxy({ channel: pluginChan });
    expect(typeof fetch.preconnect).toBe('function');
    expect(() => fetch.preconnect('https://example.com')).not.toThrow();
  });

  test('Response headers and status reflect the hub result', async () => {
    const { pluginChan } = loopback(() => ({
      status: 418,
      statusText: "I'm a teapot",
      headers: { 'content-type': 'application/json', 'x-trace': 'abc' },
      body: '{"steeped":true}',
      attempts: 1,
    }));
    const fetch = buildFetchProxy({ channel: pluginChan });
    const res = await fetch('https://api.example.com/');
    expect(res.status).toBe(418);
    expect(res.statusText).toBe("I'm a teapot");
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('x-trace')).toBe('abc');
    expect(await res.json()).toEqual({ steeped: true });
  });

  test('hub-side rejection (Zod parse fails) propagates as a thrown error', async () => {
    // Return a malformed result — missing required fields.
    const { pluginChan } = loopback(() => ({ status: 200 }));
    const fetch = buildFetchProxy({ channel: pluginChan });
    await expect(fetch('https://api.example.com/')).rejects.toThrow();
  });
});
