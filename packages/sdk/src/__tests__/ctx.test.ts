import { describe, expect, mock, test } from 'bun:test';
import type { Channel } from '@brika/ipc';
import { capabilityRequest } from '@brika/ipc/contract';
import { buildCtx } from '../ctx';
import { PermissionDeniedError } from '../errors';

/** Build a minimal Channel mock that records every `call(...)`. */
function mockChannel(handler: (id: string, args: unknown) => unknown): Channel {
  return {
    call: mock(async (def: unknown, payload: { id: string; args: unknown }) => {
      if ((def as { name: string }).name !== capabilityRequest.name) {
        throw new Error(`unexpected RPC: ${(def as { name: string }).name}`);
      }
      return { result: await handler(payload.id, payload.args) };
    }),
  } as unknown as Channel;
}

describe('buildCtx — proxy traversal', () => {
  test('routes ctx.foo.bar(args) to capability id "foo.bar"', async () => {
    let seenId = '';
    let seenArgs: unknown;
    const channel = mockChannel((id, args) => {
      seenId = id;
      seenArgs = args;
      return { value: 42 };
    });

    const ctx = buildCtx(
      { grants: [{ id: 'dev.brika.foo.bar', ctxPath: 'foo.bar' }] },
      channel
    ) as unknown as {
      foo: { bar: (args: unknown) => Promise<unknown> };
    };

    const result = await ctx.foo.bar({ x: 1 });

    expect(seenId).toBe('dev.brika.foo.bar');
    expect(seenArgs).toEqual({ x: 1 });
    expect(result).toEqual({ value: 42 });
  });

  test('throws PermissionDeniedError at the SDK boundary for missing capabilities — no IPC', async () => {
    const channel = mockChannel(() => {
      throw new Error('should not be called');
    });

    const ctx = buildCtx({ grants: [] }, channel) as unknown as {
      net: { fetch: (args: unknown) => Promise<unknown> };
    };

    await expect(ctx.net.fetch({ url: 'https://x' })).rejects.toBeInstanceOf(PermissionDeniedError);
    expect((channel.call as ReturnType<typeof mock>).mock.calls.length).toBe(0);
  });

  test('the error carries the capability id and an actionable message', async () => {
    const channel = mockChannel(() => undefined);
    const ctx = buildCtx({ grants: [] }, channel) as unknown as {
      net: { fetch: (args: unknown) => Promise<unknown> };
    };

    try {
      await ctx.net.fetch({ url: 'https://x' });
      throw new Error('expected rejection');
    } catch (e) {
      expect(e).toBeInstanceOf(PermissionDeniedError);
      const err = e as PermissionDeniedError;
      expect(err.permission).toBe('net.fetch');
      expect(err.message).toContain('net.fetch');
      expect(err.message).toContain('grant vector');
    }
  });

  test('symbol property reads return undefined (no Promise/iterator probe traps)', () => {
    const channel = mockChannel(() => undefined);
    const ctx = buildCtx({ grants: [] }, channel) as unknown as {
      [Symbol.iterator]?: unknown;
      then?: unknown;
    };
    expect(ctx[Symbol.iterator]).toBeUndefined();
    expect(ctx.then).toBeUndefined();
  });

  test('calling ctx itself (no path) is a TypeError', () => {
    const channel = mockChannel(() => undefined);
    const ctx = buildCtx({ grants: [] }, channel) as unknown as () => void;
    expect(() => ctx()).toThrow(TypeError);
  });

  test('passes an empty args object when caller invokes with no arguments', async () => {
    let seenArgs: unknown;
    const channel = mockChannel((_id, args) => {
      seenArgs = args;
      return null;
    });
    const ctx = buildCtx(
      { grants: [{ id: 'dev.brika.log.ping', ctxPath: 'log.ping' }] },
      channel
    ) as unknown as {
      log: { ping: () => Promise<unknown> };
    };
    await ctx.log.ping();
    expect(seenArgs).toEqual({});
  });
});
