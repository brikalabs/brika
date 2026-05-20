import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { defineCapability } from '../define';
import { CapabilityError, CapabilityRegistry } from '../registry';
import type { CapabilityHandlerContext } from '../types';

function makeCtx(scope: unknown = undefined): CapabilityHandlerContext {
  return {
    pluginUid: 'plug-uid',
    pluginRoot: '/tmp/plug',
    grantedScope: scope,
    log: () => undefined,
  };
}

describe('CapabilityRegistry — registration', () => {
  test('registers and looks up by id', () => {
    const reg = new CapabilityRegistry();
    const cap = defineCapability(
      { id: 'demo.hello', args: z.object({}), result: z.object({ ok: z.boolean() }) },
      () => ({ ok: true })
    );
    reg.register(cap);

    expect(reg.size).toBe(1);
    expect(reg.get('demo.hello')?.spec.id).toBe('demo.hello');
  });

  test('rejects duplicate registration with NOT_REGISTERED code', () => {
    const reg = new CapabilityRegistry();
    const cap = defineCapability(
      { id: 'demo.dup', args: z.object({}), result: z.object({}) },
      () => ({})
    );
    reg.register(cap);

    expect(() => {
      reg.register(cap);
    }).toThrow(CapabilityError);
  });
});

describe('CapabilityRegistry — dispatch', () => {
  test('validates args against the spec schema', async () => {
    const reg = new CapabilityRegistry();
    reg.register(
      defineCapability(
        {
          id: 'math.add',
          args: z.object({ a: z.number(), b: z.number() }),
          result: z.object({ sum: z.number() }),
        },
        (_, { a, b }) => ({ sum: a + b })
      )
    );

    await expect(reg.dispatch('math.add', { a: 'oops', b: 2 }, makeCtx())).rejects.toMatchObject({
      code: 'INVALID_ARGS',
    });
  });

  test('validates handler return against the result schema', async () => {
    const reg = new CapabilityRegistry();
    reg.register(
      defineCapability(
        {
          id: 'math.bad',
          args: z.object({}),
          result: z.object({ sum: z.number() }),
        },
        // Handler returns a string instead of { sum: number }
        () => ({ sum: 'not a number' }) as unknown as { sum: number }
      )
    );

    await expect(reg.dispatch('math.bad', {}, makeCtx())).rejects.toMatchObject({
      code: 'INVALID_RESULT',
    });
  });

  test('reports unregistered capabilities cleanly', async () => {
    const reg = new CapabilityRegistry();
    await expect(reg.dispatch('ghost', {}, makeCtx())).rejects.toMatchObject({
      code: 'NOT_REGISTERED',
    });
  });

  test('wraps handler exceptions with HANDLER_THREW code', async () => {
    const reg = new CapabilityRegistry();
    reg.register(
      defineCapability({ id: 'boom', args: z.object({}), result: z.object({}) }, () => {
        throw new Error('kaboom');
      })
    );

    await expect(reg.dispatch('boom', {}, makeCtx())).rejects.toMatchObject({
      code: 'HANDLER_THREW',
      message: expect.stringContaining('kaboom'),
    });
  });

  test('passes the validated scope into the handler', async () => {
    const reg = new CapabilityRegistry();
    let receivedScope: unknown;
    reg.register(
      defineCapability(
        {
          id: 'scoped.echo',
          args: z.object({}),
          result: z.object({}),
          permission: {
            name: 'echo',
            scope: z.object({ key: z.string() }),
          },
        },
        (ctx) => {
          receivedScope = ctx.grantedScope;
          return {};
        }
      )
    );
    await reg.dispatch('scoped.echo', {}, makeCtx({ key: 'value' }));
    expect(receivedScope).toEqual({ key: 'value' });
  });
});

describe('CapabilityRegistry — buildVector', () => {
  test('always vends always-on capabilities, regardless of manifest/grants', () => {
    const reg = new CapabilityRegistry();
    reg.register(
      defineCapability({ id: 'log.write', args: z.object({}), result: z.object({}) }, () => ({}))
    );

    const vec = reg.buildVector({}, {});
    expect(vec.grants.map((g) => g.id)).toEqual(['log.write']);
  });

  test('omits a permission-gated capability if the manifest does not request it', () => {
    const reg = new CapabilityRegistry();
    reg.register(
      defineCapability(
        {
          id: 'net.fetch',
          args: z.object({}),
          result: z.object({}),
          permission: { name: 'net', scope: z.object({ allow: z.array(z.string()) }) },
        },
        () => ({})
      )
    );

    const vec = reg.buildVector({}, { 'net.fetch': { allow: ['api.example.com'] } });
    expect(vec.grants).toEqual([]);
  });

  test('omits a permission-gated capability if the user has not granted it', () => {
    const reg = new CapabilityRegistry();
    reg.register(
      defineCapability(
        {
          id: 'net.fetch',
          args: z.object({}),
          result: z.object({}),
          permission: { name: 'net', scope: z.object({ allow: z.array(z.string()) }) },
        },
        () => ({})
      )
    );

    const vec = reg.buildVector({ 'net.fetch': {} }, {});
    expect(vec.grants).toEqual([]);
  });

  test('includes a granted capability with the user-provided scope', () => {
    const reg = new CapabilityRegistry();
    reg.register(
      defineCapability(
        {
          id: 'net.fetch',
          args: z.object({}),
          result: z.object({}),
          permission: { name: 'net', scope: z.object({ allow: z.array(z.string()) }) },
        },
        () => ({})
      )
    );

    const vec = reg.buildVector(
      { 'net.fetch': { scope: { allow: ['api.example.com'] } } },
      { 'net.fetch': { allow: ['api.example.com'] } }
    );
    expect(vec.grants).toEqual([
      { id: 'net.fetch', ctxPath: 'net.fetch', scope: { allow: ['api.example.com'] } },
    ]);
  });

  test('skips a grant whose scope fails schema validation', () => {
    const reg = new CapabilityRegistry();
    reg.register(
      defineCapability(
        {
          id: 'net.fetch',
          args: z.object({}),
          result: z.object({}),
          permission: { name: 'net', scope: z.object({ allow: z.array(z.string()) }) },
        },
        () => ({})
      )
    );

    const vec = reg.buildVector({ 'net.fetch': {} }, { 'net.fetch': { allow: 'not-an-array' } });
    expect(vec.grants).toEqual([]);
  });

  test('ctxPath defaults to id with the first two reverse-DNS segments stripped', () => {
    const reg = new CapabilityRegistry();
    reg.register(
      defineCapability(
        { id: 'dev.brika.net.fetch', args: z.object({}), result: z.object({}) },
        () => ({})
      )
    );
    const vec = reg.buildVector({}, {});
    expect(vec.grants[0]?.ctxPath).toBe('net.fetch');
  });

  test('ctxPath is left unchanged on short ids (<3 segments)', () => {
    const reg = new CapabilityRegistry();
    reg.register(
      defineCapability({ id: 'legacy.flat', args: z.object({}), result: z.object({}) }, () => ({}))
    );
    const vec = reg.buildVector({}, {});
    expect(vec.grants[0]?.ctxPath).toBe('legacy.flat');
  });

  test('explicit ctxPath overrides the default derivation', () => {
    const reg = new CapabilityRegistry();
    reg.register(
      defineCapability(
        {
          id: 'dev.brika.net.fetch',
          ctxPath: 'http.request',
          args: z.object({}),
          result: z.object({}),
        },
        () => ({})
      )
    );
    const vec = reg.buildVector({}, {});
    expect(vec.grants[0]?.ctxPath).toBe('http.request');
  });

  test('vector and its grants array are frozen', () => {
    const reg = new CapabilityRegistry();
    reg.register(
      defineCapability({ id: 'log.write', args: z.object({}), result: z.object({}) }, () => ({}))
    );
    const vec = reg.buildVector({}, {});
    expect(Object.isFrozen(vec)).toBe(true);
    expect(Object.isFrozen(vec.grants)).toBe(true);
  });
});
