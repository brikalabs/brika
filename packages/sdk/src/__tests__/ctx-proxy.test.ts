/**
 * Unit tests for the `ctx` Proxy. Verifies path walking, vector lookup,
 * IPC call shape, and the SDK-boundary denial path (no IPC round-trip).
 *
 * Hub-side dispatch is exercised in apps/hub's plugin tests; here we only
 * care that the Proxy correctly turns `ctx.foo.bar(args)` into either an
 * RPC call or a PermissionDeniedError.
 */

import { describe, expect, test } from 'bun:test';
import { BrikaError } from '@brika/errors';
import type { GrantVector } from '@brika/grants';
import { grantRequest } from '@brika/ipc/contract';
import { buildCtx } from '../ctx';

interface ChannelStub {
  calls: Array<{ rpc: string; payload: unknown }>;
  responses: Map<string, unknown>;
}

function stubChannel(responses: Record<string, unknown> = {}) {
  const calls: ChannelStub['calls'] = [];
  const map = new Map(Object.entries(responses));
  const channel = {
    call(def: { name: string }, payload: unknown) {
      calls.push({ rpc: def.name, payload });
      const key = JSON.stringify(payload);
      const out = map.get(key) ?? { result: undefined };
      return Promise.resolve(out);
    },
  };
  return { channel, calls };
}

const vector: GrantVector = {
  grants: [
    { id: 'dev.brika.net.fetch', ctxPath: 'net.fetch', scope: { allow: ['x.example'] } },
    { id: 'dev.brika.location.get', ctxPath: 'location.get' },
  ],
};

describe('buildCtx Proxy', () => {
  test('routes a permitted call to channel.call(grantRequest, ...) with id from vector', async () => {
    const { channel, calls } = stubChannel({
      [JSON.stringify({ id: 'dev.brika.net.fetch', args: { url: 'https://x.example' } })]: {
        result: { status: 200, body: 'ok' },
      },
    });
    // biome-ignore lint/suspicious/noExplicitAny: minimal channel stub for unit test
    const ctx = buildCtx(vector, channel as any);
    // biome-ignore lint/suspicious/noExplicitAny: untyped Ctx augmentation for raw proxy test
    const result = await (ctx as any).net.fetch({ url: 'https://x.example' });
    expect(result).toEqual({ status: 200, body: 'ok' });
    expect(calls).toEqual([
      {
        rpc: grantRequest.name,
        payload: { id: 'dev.brika.net.fetch', args: { url: 'https://x.example' } },
      },
    ]);
  });

  test('denies an unpermitted call at the SDK boundary (no channel.call)', async () => {
    const { channel, calls } = stubChannel();
    // biome-ignore lint/suspicious/noExplicitAny: minimal channel stub for unit test
    const ctx = buildCtx(vector, channel as any);
    let thrown: BrikaError | undefined;
    try {
      // biome-ignore lint/suspicious/noExplicitAny: untyped path for the denial probe
      await (ctx as any).fs.read({ path: '/etc/passwd' });
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown).toBeInstanceOf(BrikaError);
    expect(thrown?.code).toBe('PERMISSION_DENIED');
    expect(calls).toEqual([]);
  });

  test('calling ctx itself throws a TypeError (typing bug, not a denial)', () => {
    const { channel } = stubChannel();
    // biome-ignore lint/suspicious/noExplicitAny: minimal channel stub for unit test
    const ctx = buildCtx(vector, channel as any);
    // biome-ignore lint/suspicious/noExplicitAny: deliberately mis-invoking the proxy root
    expect(() => (ctx as any)()).toThrow(TypeError);
  });

  test('symbol/then probes do not trigger a denial or RPC', async () => {
    const { channel, calls } = stubChannel();
    // biome-ignore lint/suspicious/noExplicitAny: minimal channel stub for unit test
    const ctx = buildCtx(vector, channel as any);
    // Promise-detection on ctx itself returns undefined for `then`,
    // proving Proxy `get` short-circuits on symbol/then.
    // biome-ignore lint/suspicious/noExplicitAny: introspecting raw proxy
    expect((ctx as any).then).toBeUndefined();
    // biome-ignore lint/suspicious/noExplicitAny: introspecting raw proxy
    expect((ctx as any)[Symbol.iterator]).toBeUndefined();
    expect(calls).toEqual([]);
  });

  test('arg-less call sends {} payload', async () => {
    const { channel, calls } = stubChannel({
      [JSON.stringify({ id: 'dev.brika.location.get', args: {} })]: { result: null },
    });
    // biome-ignore lint/suspicious/noExplicitAny: minimal channel stub for unit test
    const ctx = buildCtx(vector, channel as any);
    // biome-ignore lint/suspicious/noExplicitAny: untyped Ctx augmentation
    await (ctx as any).location.get();
    expect(calls[0]?.payload).toEqual({ id: 'dev.brika.location.get', args: {} });
  });
});
