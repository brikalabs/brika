import { describe, expect, test } from 'bun:test';
import { BrikaError } from '@brika/errors';
import { z } from 'zod';
import {
  defineGrant,
  GrantError,
  type GrantHandlerContext,
  GrantRegistry,
  resolveCtxPath,
} from '../index';

const handlerCtx = (overrides: Partial<GrantHandlerContext> = {}): GrantHandlerContext => ({
  pluginUid: 'test-plugin',
  pluginRoot: '/tmp/plugin',
  grantedScope: undefined,
  log: () => {},
  signal: new AbortController().signal,
  ...overrides,
});

const ping = defineGrant(
  {
    id: 'dev.brika.test.ping',
    ctxPath: 'test.ping',
    args: z.object({ value: z.string() }),
    result: z.object({ echo: z.string() }),
  },
  (_, args) => ({ echo: args.value })
);

const netFetch = defineGrant(
  {
    id: 'dev.brika.net.fetch',
    args: z.object({ url: z.url() }),
    result: z.object({ status: z.number() }),
    permission: {
      name: 'net',
      scope: z.object({ allow: z.array(z.string()) }),
      defaultScope: { allow: [] },
      icon: 'globe',
    },
  },
  // Spec-only placeholder — the handler is rebound on the hub side.
  () => ({ status: 200 })
);

describe('GrantRegistry', () => {
  test('register + get + size', () => {
    const reg = new GrantRegistry();
    reg.register(ping);
    expect(reg.size).toBe(1);
    expect(reg.get('dev.brika.test.ping')).toBe(ping);
    expect(reg.get('missing')).toBeUndefined();
  });

  test('rejects duplicate registration with ALREADY_REGISTERED code', () => {
    const reg = new GrantRegistry();
    reg.register(ping);
    let thrown: GrantError | undefined;
    try {
      reg.register(ping);
    } catch (e) {
      if (e instanceof GrantError) {
        thrown = e;
      }
    }
    expect(thrown).toBeInstanceOf(GrantError);
    expect(thrown?.code).toBe('ALREADY_REGISTERED');
  });

  test('dispatch returns parsed result on happy path', async () => {
    const reg = new GrantRegistry();
    reg.register(ping);
    const result = await reg.dispatch('dev.brika.test.ping', { value: 'hello' }, handlerCtx());
    expect(result).toEqual({ echo: 'hello' });
  });

  test('dispatch throws INVALID_INPUT on bad args', async () => {
    const reg = new GrantRegistry();
    reg.register(ping);
    let thrown: GrantError | undefined;
    try {
      await reg.dispatch('dev.brika.test.ping', { value: 42 }, handlerCtx());
    } catch (e) {
      if (e instanceof GrantError) {
        thrown = e;
      }
    }
    expect(thrown).toBeInstanceOf(GrantError);
    expect(thrown?.code).toBe('INVALID_INPUT');
  });

  test('dispatch throws NOT_REGISTERED on unknown id', async () => {
    const reg = new GrantRegistry();
    let thrown: GrantError | undefined;
    try {
      await reg.dispatch('dev.brika.missing', {}, handlerCtx());
    } catch (e) {
      if (e instanceof GrantError) {
        thrown = e;
      }
    }
    expect(thrown).toBeInstanceOf(GrantError);
    expect(thrown?.code).toBe('NOT_REGISTERED');
  });

  test('dispatch passes BrikaError throws through unchanged', async () => {
    const reg = new GrantRegistry();
    const typedThrower = defineGrant(
      {
        id: 'dev.brika.test.throw-typed',
        ctxPath: 'test.throwTyped',
        args: z.object({}),
        result: z.object({}),
      },
      () => {
        throw new BrikaError('PERMISSION_DENIED', 'nope');
      }
    );
    reg.register(typedThrower);
    let thrown: BrikaError | undefined;
    try {
      await reg.dispatch('dev.brika.test.throw-typed', {}, handlerCtx());
    } catch (e) {
      if (e instanceof BrikaError) {
        thrown = e;
      }
    }
    expect(thrown).toBeInstanceOf(BrikaError);
    expect(thrown?.code).toBe('PERMISSION_DENIED');
  });

  test('dispatch wraps non-BrikaError throws as INTERNAL with cause chain', async () => {
    const reg = new GrantRegistry();
    const plainThrower = defineGrant(
      {
        id: 'dev.brika.test.throw-plain',
        ctxPath: 'test.throwPlain',
        args: z.object({}),
        result: z.object({}),
      },
      () => {
        throw new Error('boom');
      }
    );
    reg.register(plainThrower);
    let thrown: GrantError | undefined;
    try {
      await reg.dispatch('dev.brika.test.throw-plain', {}, handlerCtx());
    } catch (e) {
      if (e instanceof GrantError) {
        thrown = e;
      }
    }
    expect(thrown).toBeInstanceOf(GrantError);
    expect(thrown?.code).toBe('INTERNAL');
    expect(thrown?.cause).toBeInstanceOf(Error);
    if (thrown?.cause instanceof Error) {
      expect(thrown.cause.message).toBe('boom');
    }
  });

  test('dispatch defensively re-parses scope and throws INVALID_SCOPE on garbage', async () => {
    const reg = new GrantRegistry();
    const captured: unknown[] = [];
    const captureScope = defineGrant(
      {
        id: 'dev.brika.test.capture',
        ctxPath: 'test.capture',
        args: z.object({}),
        result: z.object({}),
        permission: {
          name: 'capture',
          scope: z.object({ tag: z.string() }),
        },
      },
      (ctx) => {
        captured.push(ctx.grantedScope);
        return {};
      }
    );
    reg.register(captureScope);
    // valid scope flows through
    await reg.dispatch('dev.brika.test.capture', {}, handlerCtx({ grantedScope: { tag: 'ok' } }));
    expect(captured).toEqual([{ tag: 'ok' }]);

    // garbage scope throws INVALID_SCOPE (and the handler is NOT invoked)
    let thrown: GrantError | undefined;
    try {
      await reg.dispatch('dev.brika.test.capture', {}, handlerCtx({ grantedScope: { tag: 42 } }));
    } catch (e) {
      if (e instanceof GrantError) {
        thrown = e;
      }
    }
    expect(thrown).toBeInstanceOf(GrantError);
    expect(thrown?.code).toBe('INVALID_SCOPE');
    expect(captured).toEqual([{ tag: 'ok' }]); // unchanged
  });

  test('buildVector includes always-on grants unconditionally', () => {
    const reg = new GrantRegistry();
    reg.register(ping); // no permission gate
    const v = reg.buildVector({}, {});
    expect(v.grants).toEqual([{ id: 'dev.brika.test.ping', ctxPath: 'test.ping' }]);
  });

  test('buildVector requires manifest + permit for gated grants', () => {
    const reg = new GrantRegistry();
    reg.register(netFetch);
    expect(reg.buildVector({}, {}).grants).toEqual([]);
    expect(reg.buildVector({ 'dev.brika.net.fetch': {} }, {}).grants).toEqual([]); // requested but not permitted
    expect(reg.buildVector({}, { 'dev.brika.net.fetch': { allow: ['x'] } }).grants).toEqual([]); // permitted but not requested
  });

  test('buildVector validates scope and drops invalid permits via onInvalidScope', () => {
    const reg = new GrantRegistry();
    reg.register(netFetch);
    const seen: Array<{ id: string; issueCount: number }> = [];
    const v = reg.buildVector(
      { 'dev.brika.net.fetch': {} },
      { 'dev.brika.net.fetch': { allow: 'not-an-array' } },
      (id, err) => seen.push({ id, issueCount: err.issues.length })
    );
    expect(v.grants).toEqual([]);
    expect(seen).toEqual([{ id: 'dev.brika.net.fetch', issueCount: 1 }]);
  });

  test('buildVector emits typed scope on the entry', () => {
    const reg = new GrantRegistry();
    reg.register(netFetch);
    const v = reg.buildVector(
      { 'dev.brika.net.fetch': {} },
      { 'dev.brika.net.fetch': { allow: ['api.example.com'] } }
    );
    expect(v.grants).toEqual([
      {
        id: 'dev.brika.net.fetch',
        ctxPath: 'net.fetch',
        scope: { allow: ['api.example.com'] },
      },
    ]);
  });

  test('vector is frozen', () => {
    const reg = new GrantRegistry();
    reg.register(ping);
    const v = reg.buildVector({}, {});
    expect(Object.isFrozen(v)).toBe(true);
    expect(Object.isFrozen(v.grants)).toBe(true);
  });
});

describe('GrantRegistry edge cases', () => {
  test('list() iterates in registration order', () => {
    const reg = new GrantRegistry();
    reg.register(ping);
    reg.register(netFetch);
    const ids = [...reg.list()].map((g) => g.spec.id);
    expect(ids).toEqual(['dev.brika.test.ping', 'dev.brika.net.fetch']);
  });

  test('size reflects current registered count', () => {
    const reg = new GrantRegistry();
    expect(reg.size).toBe(0);
    reg.register(ping);
    expect(reg.size).toBe(1);
    reg.register(netFetch);
    expect(reg.size).toBe(2);
  });

  test('buildVector with default-scope fallback uses spec.permission.defaultScope', () => {
    const reg = new GrantRegistry();
    reg.register(netFetch);
    // Permit value is undefined → registry falls back to defaultScope = { allow: [] }
    const v = reg.buildVector({ 'dev.brika.net.fetch': {} }, { 'dev.brika.net.fetch': undefined });
    expect(v.grants).toEqual([
      {
        id: 'dev.brika.net.fetch',
        ctxPath: 'net.fetch',
        scope: { allow: [] },
      },
    ]);
  });

  test('dispatch returns parsed output (schema strips unknown fields)', async () => {
    const reg = new GrantRegistry();
    const extraFieldGrant = defineGrant(
      {
        id: 'dev.brika.test.extra',
        ctxPath: 'test.extra',
        args: z.object({}),
        result: z.object({ value: z.string() }),
      },
      // Return a result with an extra field — the registry's result.safeParse
      // strips it per Zod's default behaviour.
      () => ({ value: 'ok', extra: 'should-be-dropped' }) as unknown as { value: string }
    );
    reg.register(extraFieldGrant);
    const out = (await reg.dispatch('dev.brika.test.extra', {}, handlerCtx())) as {
      value: string;
      extra?: string;
    };
    expect(out).toEqual({ value: 'ok' });
    expect(out.extra).toBeUndefined();
  });

  test('dispatch throws INVALID_OUTPUT when handler returns wrong shape', async () => {
    const reg = new GrantRegistry();
    const wrongShape = defineGrant(
      {
        id: 'dev.brika.test.wrong',
        ctxPath: 'test.wrong',
        args: z.object({}),
        result: z.object({ value: z.string() }),
      },
      () => ({ value: 42 }) as unknown as { value: string }
    );
    reg.register(wrongShape);
    let thrown: GrantError | undefined;
    try {
      await reg.dispatch('dev.brika.test.wrong', {}, handlerCtx());
    } catch (e) {
      if (e instanceof GrantError) {
        thrown = e;
      }
    }
    expect(thrown?.code).toBe('INVALID_OUTPUT');
  });

  test('register exposes get(id) lookup', () => {
    const reg = new GrantRegistry();
    reg.register(netFetch);
    expect(reg.get('dev.brika.net.fetch')).toBe(netFetch);
    expect(reg.get('missing.id')).toBeUndefined();
  });
});

describe('resolveCtxPath', () => {
  test('strips first two reverse-DNS segments by default', () => {
    expect(resolveCtxPath({ id: 'dev.brika.net.fetch' })).toBe('net.fetch');
    expect(resolveCtxPath({ id: 'com.acme.crypto.sign' })).toBe('crypto.sign');
  });

  test('explicit ctxPath wins', () => {
    expect(resolveCtxPath({ id: 'dev.brika.x.y', ctxPath: 'foo.bar' })).toBe('foo.bar');
  });

  test('short ids pass through unchanged', () => {
    expect(resolveCtxPath({ id: 'foo' })).toBe('foo');
    expect(resolveCtxPath({ id: 'foo.bar' })).toBe('foo.bar');
  });
});
