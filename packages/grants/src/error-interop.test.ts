/**
 * Cross-package integration tests: confirms `GrantError` interoperates
 * cleanly with the `@brika/errors` public surface (wire round-trip,
 * `matchBrikaError`, RFC 9457 HTTP envelope, catalog lookups, factory
 * codes, `onThrow` observability).
 *
 * The registry is a heavy consumer of `BrikaError` — every dispatch
 * failure surfaces a `GrantError extends BrikaError`. These tests prove
 * the integration end-to-end so a future drift between the two packages
 * (e.g. a renamed catalog field or a tightened wire schema) gets
 * caught at the grants edge instead of one ring further in.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import {
  BrikaError,
  BrikaErrorWireSchema,
  brikaErrorToResponse,
  buildCustomError,
  buildError,
  errors,
  httpStatusForCode,
  isBrikaErrorWire,
  isRetryable,
  lookupCatalogEntry,
  matchBrikaError,
  severityForCode,
} from '@brika/errors';
import { z } from 'zod';
import { defineGrant, GrantError, type GrantHandlerContext, GrantRegistry } from './index';

const handlerCtx = (overrides: Partial<GrantHandlerContext> = {}): GrantHandlerContext => ({
  pluginUid: 'interop-plugin',
  pluginRoot: '/nonexistent/interop',
  grantedScope: undefined,
  log: () => {},
  signal: new AbortController().signal,
  ...overrides,
});

const noop = defineGrant(
  {
    id: 'dev.brika.interop.noop',
    args: z.object({ value: z.string() }),
    result: z.object({ ok: z.literal(true) }),
  },
  () => ({ ok: true as const })
);

afterEach(() => {
  BrikaError.clearThrowHandlers();
});

describe('GrantError ↔ BrikaError class', () => {
  test('GrantError instances are BrikaError instances (instanceof chain)', () => {
    const err = new GrantError('NOT_REGISTERED', 'missing', 'dev.brika.x');
    expect(err).toBeInstanceOf(GrantError);
    expect(err).toBeInstanceOf(BrikaError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('GrantError');
  });

  test('GrantError carries grantId both as a field and inside data', () => {
    const err = new GrantError('INVALID_INPUT', 'bad', 'dev.brika.x.y');
    expect(err.grantId).toBe('dev.brika.x.y');
    expect(err.data).toEqual({ grantId: 'dev.brika.x.y' });
    expect(Object.isFrozen(err.data)).toBe(true);
  });

  test('GrantError without grantId has no data', () => {
    const err = new GrantError('INTERNAL', 'oops');
    expect(err.grantId).toBeUndefined();
    expect(err.data).toBeUndefined();
  });

  test('GrantError preserves cause via ES2022 cause option', () => {
    const underlying = new Error('underlying');
    const err = new GrantError('INTERNAL', 'wrapped', 'dev.brika.x', underlying);
    expect(err.cause).toBe(underlying);
  });
});

describe('BrikaError.is narrows GrantError codes', () => {
  test('matches catalog code + accepts the registry-emitted data shape', () => {
    const thrown: unknown = new GrantError('NOT_REGISTERED', 'no such grant', 'dev.brika.test.x');
    if (BrikaError.is(thrown, 'NOT_REGISTERED')) {
      expect(thrown.data?.grantId).toBe('dev.brika.test.x');
    } else {
      throw new Error('expected NOT_REGISTERED narrow');
    }
  });

  test('mismatch returns false even when both codes exist in the catalog', () => {
    const err = new GrantError('NOT_REGISTERED', 'x', 'g.id');
    expect(BrikaError.is(err, 'ALREADY_REGISTERED')).toBe(false);
  });

  test('rejects non-BrikaError values', () => {
    expect(BrikaError.is(new Error('plain'), 'NOT_REGISTERED')).toBe(false);
    expect(BrikaError.is(undefined, 'NOT_REGISTERED')).toBe(false);
    expect(BrikaError.is({ code: 'NOT_REGISTERED' }, 'NOT_REGISTERED')).toBe(false);
  });

  test('rejects when the data shape fails the catalog schema', () => {
    // ALREADY_REGISTERED requires data.grantId — bare GrantError without grantId fails.
    const err = new GrantError('ALREADY_REGISTERED', 'duplicate');
    expect(BrikaError.is(err, 'ALREADY_REGISTERED')).toBe(false);
  });

  test('matches catalog codes without a data schema (e.g. INTERNAL) regardless of payload', () => {
    const err = new GrantError('INTERNAL', 'boom');
    expect(BrikaError.is(err, 'INTERNAL')).toBe(true);
  });
});

describe('BrikaError wire round-trip from GrantError', () => {
  test('toWire emits the canonical envelope for a GrantError', () => {
    const err = new GrantError('NOT_REGISTERED', 'gone', 'dev.brika.x.y');
    const wire = err.toWire();
    expect(wire._brikaError).toBe(true);
    expect(wire.code).toBe('NOT_REGISTERED');
    expect(wire.message).toBe('gone');
    expect(wire.data).toEqual({ grantId: 'dev.brika.x.y' });
  });

  test('toWire includeStack option carries stack across the boundary', () => {
    const err = new GrantError('INTERNAL', 'with stack');
    expect(err.toWire().stack).toBeUndefined();
    const withStack = err.toWire({ includeStack: true });
    expect(typeof withStack.stack).toBe('string');
    expect(withStack.stack).toContain('with stack');
  });

  test('fromWire reconstructs a BrikaError from a GrantError envelope', () => {
    const original = new GrantError('INVALID_INPUT', 'no good', 'dev.brika.x');
    const restored = BrikaError.fromWire(original.toWire());
    expect(restored).toBeInstanceOf(BrikaError);
    expect(restored.code).toBe('INVALID_INPUT');
    expect(restored.data).toEqual({ grantId: 'dev.brika.x' });
  });

  test('fromWire preserves remote stack as a separate frame', () => {
    const original = new GrantError('INTERNAL', 'oops');
    const wire = original.toWire({ includeStack: true });
    const restored = BrikaError.fromWire(wire);
    expect(restored.stack).toContain('--- remote stack ---');
  });

  test('fromWire round-trips a BrikaError cause chain', () => {
    const inner = new GrantError('INVALID_INPUT', 'inner', 'dev.brika.inner');
    const outer = new GrantError('INTERNAL', 'outer', 'dev.brika.outer', inner);
    const wire = outer.toWire();
    const restored = BrikaError.fromWire(wire);
    expect(restored.cause).toBeInstanceOf(BrikaError);
    if (restored.cause instanceof BrikaError) {
      expect(restored.cause.code).toBe('INVALID_INPUT');
      expect(restored.cause.data).toEqual({ grantId: 'dev.brika.inner' });
    }
  });

  test('fromWire flattens plain-Error causes to message + name', () => {
    const inner = new TypeError('boom');
    const outer = new GrantError('INTERNAL', 'outer', 'dev.brika.x', inner);
    const wire = outer.toWire();
    expect(wire.cause).toBeDefined();
    const restored = BrikaError.fromWire(wire);
    expect(restored.cause).toBeInstanceOf(Error);
    if (restored.cause instanceof Error) {
      expect(restored.cause.message).toBe('boom');
    }
  });

  test('toWire terminates on circular cause chains with the sentinel frame', () => {
    interface Mutable {
      cause?: unknown;
    }
    const a: GrantError & Mutable = new GrantError('INTERNAL', 'a');
    const b: GrantError & Mutable = new GrantError('INTERNAL', 'b', undefined, a);
    a.cause = b;
    expect(JSON.stringify(a.toWire())).toContain('[circular cause]');
  });

  test('toWire stringifies non-Error causes', () => {
    const stringCause = new GrantError('INTERNAL', 'with str cause', undefined, 'raw-string');
    const stringWire = stringCause.toWire();
    expect(stringWire.cause).toEqual({ message: 'raw-string' });

    const objCause = new GrantError('INTERNAL', 'with obj cause', undefined, { hint: 42 });
    const objWire = objCause.toWire();
    if (objWire.cause && !('_brikaError' in objWire.cause)) {
      expect(objWire.cause.message).toBe(JSON.stringify({ hint: 42 }));
    } else {
      throw new Error('expected flat object-cause frame');
    }

    const numCause = new GrantError('INTERNAL', 'with num cause', undefined, 42);
    const numWire = numCause.toWire();
    expect(numWire.cause).toEqual({ message: '42' });
  });

  test('toWire drops null/undefined causes silently', () => {
    expect(new GrantError('INTERNAL', 'a', undefined, null).toWire().cause).toBeUndefined();
    expect(new GrantError('INTERNAL', 'a', undefined, undefined).toWire().cause).toBeUndefined();
  });

  test('toWire falls back to Object.prototype.toString when JSON.stringify throws', () => {
    interface CircularBag {
      self?: CircularBag;
    }
    const cycle: CircularBag = {};
    cycle.self = cycle;
    const err = new GrantError('INTERNAL', 'x', undefined, cycle);
    const wire = err.toWire();
    if (wire.cause && !('_brikaError' in wire.cause)) {
      expect(wire.cause.message).toBe('[object Object]');
    } else {
      throw new Error('expected stringified cause');
    }
  });
});

describe('isBrikaErrorWire / BrikaErrorWireSchema', () => {
  test('accepts a GrantError-produced envelope', () => {
    const wire = new GrantError('NOT_REGISTERED', 'no', 'dev.x').toWire();
    expect(isBrikaErrorWire(wire)).toBe(true);
  });

  test('rejects envelopes missing the discriminator', () => {
    expect(isBrikaErrorWire({ code: 'INTERNAL', message: 'x' })).toBe(false);
    expect(isBrikaErrorWire(null)).toBe(false);
    expect(isBrikaErrorWire('string')).toBe(false);
    expect(isBrikaErrorWire({ _brikaError: false, code: 'x', message: 'y' })).toBe(false);
  });

  test('exported schema validates GrantError envelopes', () => {
    const wire = new GrantError('INVALID_OUTPUT', 'bad', 'dev.x').toWire();
    const parsed = BrikaErrorWireSchema.safeParse(wire);
    expect(parsed.success).toBe(true);
  });
});

describe('BrikaError.onThrow observability', () => {
  test('fires once per GrantError construction', () => {
    const seen: BrikaError[] = [];
    const off = BrikaError.onThrow((e) => {
      seen.push(e);
    });
    const first = new GrantError('NOT_REGISTERED', 'a', 'dev.brika.a');
    const second = new GrantError('INVALID_INPUT', 'b', 'dev.brika.b');
    off();
    expect(seen).toEqual([first, second]);
  });

  test('off() unregisters the handler', () => {
    const seen: BrikaError[] = [];
    const off = BrikaError.onThrow((e) => {
      seen.push(e);
    });
    off();
    const after = new GrantError('INTERNAL', 'after-off');
    expect(seen).toHaveLength(0);
    expect(after.message).toBe('after-off');
  });

  test('clearThrowHandlers wipes every registered handler', () => {
    const seen: BrikaError[] = [];
    BrikaError.onThrow((e) => {
      seen.push(e);
    });
    BrikaError.onThrow((e) => {
      seen.push(e);
    });
    BrikaError.clearThrowHandlers();
    const after = new GrantError('INTERNAL', 'after-clear');
    expect(seen).toHaveLength(0);
    expect(after.message).toBe('after-clear');
  });

  test('throwing handler does not break construction', () => {
    BrikaError.onThrow(() => {
      throw new Error('handler-blew-up');
    });
    let constructed: GrantError | undefined;
    try {
      constructed = new GrantError('INTERNAL', 'still-constructs');
    } catch {
      // Construction should swallow the observer error; this branch should
      // never run. We assert the success path below.
    }
    expect(constructed).toBeInstanceOf(GrantError);
    expect(constructed?.message).toBe('still-constructs');
  });

  test('observes registry-emitted GrantErrors end-to-end', async () => {
    const seen: BrikaError[] = [];
    BrikaError.onThrow((e) => {
      seen.push(e);
    });
    const reg = new GrantRegistry();
    reg.register(noop);
    await expect(
      reg.dispatch('dev.brika.interop.noop', { value: 42 }, handlerCtx())
    ).rejects.toBeInstanceOf(GrantError);
    expect(seen.some((e) => e.code === 'INVALID_INPUT')).toBe(true);
  });
});

describe('matchBrikaError covers GrantError codes', () => {
  test('dispatches to the per-code handler with typed data', () => {
    const err: unknown = new GrantError('ALREADY_REGISTERED', 'dup', 'dev.brika.test.dup');
    const view = matchBrikaError(err, {
      ALREADY_REGISTERED: (data) => `dup:${data.grantId}`,
      NOT_REGISTERED: (data) => `gone:${data.grantId}`,
      _: () => 'fallback',
    });
    expect(view).toBe('dup:dev.brika.test.dup');
  });

  test('falls through to the _ arm when the code has no handler', () => {
    const err = new GrantError('INVALID_OUTPUT', 'bad', 'dev.brika.x');
    const view = matchBrikaError(err, {
      NOT_REGISTERED: () => 'no',
      _: () => 'caught',
    });
    expect(view).toBe('caught');
  });

  test('catches plain Errors via the _ arm', () => {
    const view = matchBrikaError(new Error('plain'), {
      NOT_REGISTERED: () => 'never',
      _: (e) => (e instanceof Error ? `plain:${e.message}` : 'other'),
    });
    expect(view).toBe('plain:plain');
  });

  test('catches non-Error throws via the _ arm', () => {
    const view = matchBrikaError('a-string', {
      _: (e) => `string:${typeof e}`,
    });
    expect(view).toBe('string:string');
  });

  test('ignores a "_" code on a BrikaError and routes via _', () => {
    // pickHandler refuses to dispatch on the literal `_` key.
    const err = new BrikaError('_', 'edge');
    const view = matchBrikaError(err, {
      _: () => 'caught',
    });
    expect(view).toBe('caught');
  });

  test('routes BrikaError sub-types (uncataloged code) to the _ arm', () => {
    // The catalog has no entry for `PLUGIN_DEFINED`, so pickHandler refuses
    // to dispatch even if the map has an exact-match key.
    const err = new BrikaError('PLUGIN_DEFINED', 'custom');
    const view = matchBrikaError(err, {
      _: () => 'caught',
    });
    expect(view).toBe('caught');
  });
});

describe('brikaErrorToResponse with GrantError', () => {
  test('emits the catalog status + RFC 9457 envelope', async () => {
    const res = brikaErrorToResponse(
      new GrantError('NOT_REGISTERED', 'no such grant', 'dev.brika.test.x')
    );
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toBe('application/problem+json');
    const body = await res.json();
    expect(body.code).toBe('NOT_REGISTERED');
    expect(body.type).toBe('https://brika.dev/errors/grants/not-registered');
    expect(body.title).toBe('Grant not registered');
    expect(body.status).toBe(404);
    expect(body.data).toEqual({ grantId: 'dev.brika.test.x' });
    expect(body.retryable).toBe(false);
    expect(typeof body.developerHint).toBe('string');
  });

  test('threads traceId + instance options into the response', async () => {
    const res = brikaErrorToResponse(new GrantError('INVALID_INPUT', 'bad', 'dev.brika.test.x'), {
      traceId: 'trace-42',
      instance: '/api/grants/dispatch',
    });
    const body = await res.json();
    expect(body.traceId).toBe('trace-42');
    expect(body.instance).toBe('/api/grants/dispatch');
  });

  test('uses status 500 fallback for uncataloged codes', async () => {
    const custom = buildCustomError('PLUGIN_CUSTOM_CODE', 'custom-fail');
    const res = brikaErrorToResponse(custom);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.type).toBe('about:blank');
    expect(body.title).toBe('Internal error');
  });

  test('returns 500 + generic message for non-BrikaError throws', async () => {
    const res = brikaErrorToResponse(new Error('leaky internals'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.detail).toBe('Internal server error');
    expect(body.code).toBe('INTERNAL');
  });

  test('threads traceId/instance on the non-BrikaError path too', async () => {
    const res = brikaErrorToResponse(new Error('x'), {
      traceId: 'tr-1',
      instance: '/x',
    });
    const body = await res.json();
    expect(body.traceId).toBe('tr-1');
    expect(body.instance).toBe('/x');
  });
});

describe('catalog lookups for grant codes', () => {
  test('lookupCatalogEntry returns the row for grant codes', () => {
    const entry = lookupCatalogEntry('NOT_REGISTERED');
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('grants');
    expect(entry?.status).toBe(404);
  });

  test('lookupCatalogEntry returns undefined for an unknown code', () => {
    expect(lookupCatalogEntry('NOT_A_REAL_CODE')).toBeUndefined();
  });

  test('httpStatusForCode resolves catalog status, defaulting to 500', () => {
    expect(httpStatusForCode('NOT_REGISTERED')).toBe(404);
    expect(httpStatusForCode('ALREADY_REGISTERED')).toBe(500);
    expect(httpStatusForCode('PERMISSION_DENIED')).toBe(403);
    expect(httpStatusForCode('UNKNOWN_CODE')).toBe(500);
  });

  test('severityForCode defaults unknown codes to "error"', () => {
    expect(severityForCode('NOT_REGISTERED')).toBe('error');
    expect(severityForCode('UNKNOWN_CODE')).toBe('error');
  });

  test('isRetryable reads the retryable flag, defaults to false', () => {
    expect(isRetryable('NOT_REGISTERED')).toBe(false);
    expect(isRetryable('TIMEOUT')).toBe(true);
    expect(isRetryable('UNKNOWN_CODE')).toBe(false);
  });
});

describe('factories produce codes the registry surfaces', () => {
  test('errors.notRegistered builds a typed BrikaError matching registry output', () => {
    const e = errors.notRegistered({ grantId: 'dev.brika.test.x' });
    expect(e).toBeInstanceOf(BrikaError);
    expect(e.code).toBe('NOT_REGISTERED');
    expect(e.data).toEqual({ grantId: 'dev.brika.test.x' });
    expect(e.message).toContain('dev.brika.test.x');
  });

  test('errors.alreadyRegistered / invalidOutput / invalidScope all build the right codes', () => {
    expect(errors.alreadyRegistered({ grantId: 'a' }).code).toBe('ALREADY_REGISTERED');
    expect(errors.invalidOutput({ grantId: 'a' }).code).toBe('INVALID_OUTPUT');
    expect(errors.invalidScope({ grantId: 'a' }).code).toBe('INVALID_SCOPE');
  });

  test('errors.internal accepts no args and surfaces the default message', () => {
    const e = errors.internal();
    expect(e.code).toBe('INTERNAL');
    expect(typeof e.message).toBe('string');
    expect(e.message.length).toBeGreaterThan(0);
  });

  test('errors.invalidInput accepts an optional field and uses the catalog message', () => {
    const e = errors.invalidInput({ field: 'args.url' });
    expect(e.code).toBe('INVALID_INPUT');
    expect(e.message).toContain('args.url');
    expect(errors.invalidInput().message).toBe('Invalid input.');
  });

  test('errors.timeout formats the message across operation+timeoutMs combinations', () => {
    expect(errors.timeout().message).toBe('Operation timed out.');
    expect(errors.timeout({ operation: 'fetch' }).message).toBe('Operation "fetch" timed out.');
    expect(errors.timeout({ timeoutMs: 100 }).message).toBe('Operation timed out after 100ms.');
    expect(errors.timeout({ operation: 'fetch', timeoutMs: 100 }).message).toBe(
      'Operation "fetch" timed out after 100ms.'
    );
  });

  test('errors.unavailable / notFound / permissionDenied / pluginNotFound / pluginConfigInvalid round-trip codes', () => {
    expect(errors.unavailable().code).toBe('UNAVAILABLE');
    expect(errors.notFound({ resource: 'r' }).code).toBe('NOT_FOUND');
    expect(errors.permissionDenied({ permission: 'p' }).code).toBe('PERMISSION_DENIED');
    expect(errors.pluginNotFound({ pluginId: 'p' }).code).toBe('PLUGIN_NOT_FOUND');
    expect(errors.pluginConfigInvalid({ pluginId: 'p' }).code).toBe('PLUGIN_CONFIG_INVALID');
    expect(errors.manifestInvalid({ manifestPath: '/p/package.json' }).code).toBe(
      'MANIFEST_INVALID'
    );
    expect(errors.manifestMissingMain({ manifestPath: '/p/package.json' }).code).toBe(
      'MANIFEST_MISSING_MAIN'
    );
  });

  test('errors net.* / fs.* / ws.* factories all build the expected codes', () => {
    expect(errors.netHostNotAllowed({ host: 'h', allow: [] }).code).toBe('NET_HOST_NOT_ALLOWED');
    expect(errors.netProtocolBlocked({ protocol: 'ftp' }).code).toBe('NET_PROTOCOL_BLOCKED');
    expect(
      errors.netPrivateIpBlocked({ host: 'h', ip: 'redacted', category: 'private' }).code
    ).toBe('NET_PRIVATE_IP_BLOCKED');
    expect(errors.netRedirectBlocked({ from: 'a', to: 'b', allow: [] }).code).toBe(
      'NET_REDIRECT_BLOCKED'
    );
    expect(errors.netRedirectLoop({ url: 'u', hops: 6 }).code).toBe('NET_REDIRECT_LOOP');
    expect(errors.netBodyTooLarge({ limit: 1, received: 2 }).code).toBe('NET_BODY_TOO_LARGE');
    expect(errors.fsPathOutsideRoot({ path: '/p' }).code).toBe('FS_PATH_OUTSIDE_ROOT');
    expect(errors.fsSymlinkEscape({ path: '/p' }).code).toBe('FS_SYMLINK_ESCAPE');
    expect(errors.fsQuotaExceeded({ root: '/data', limit: 1, requested: 2 }).code).toBe(
      'FS_QUOTA_EXCEEDED'
    );
    expect(errors.fsFileTooLarge({ limit: 1, requested: 2 }).code).toBe('FS_FILE_TOO_LARGE');
    expect(errors.fsAlreadyExists({ path: '/p' }).code).toBe('FS_ALREADY_EXISTS');
    expect(errors.fsNotFound({ path: '/p' }).code).toBe('FS_NOT_FOUND');
    expect(errors.wsOpenLimitExceeded({ limit: 1 }).code).toBe('WS_OPEN_LIMIT_EXCEEDED');
    expect(errors.wsHandleNotFound({ handleId: 'h' }).code).toBe('WS_HANDLE_NOT_FOUND');
    expect(errors.wsFrameTooLarge({ limit: 1, requested: 2 }).code).toBe('WS_FRAME_TOO_LARGE');
  });

  test('buildError honours an explicit message override', () => {
    const e = buildError('NOT_REGISTERED', { grantId: 'dev.brika.x' }, { message: 'custom' });
    expect(e.message).toBe('custom');
  });

  test('buildError threads cause through to the BrikaError', () => {
    const cause = new Error('underlying');
    const e = buildError('NOT_REGISTERED', { grantId: 'dev.brika.x' }, { cause });
    expect(e.cause).toBe(cause);
  });

  test('buildCustomError builds an uncataloged code with custom message + data', () => {
    const cause = new Error('underlying');
    const e = buildCustomError('PLUGIN_DEFINED_CODE', 'custom', {
      data: { extra: 'payload' },
      cause,
    });
    expect(e.code).toBe('PLUGIN_DEFINED_CODE');
    expect(e.message).toBe('custom');
    expect(e.data).toEqual({ extra: 'payload' });
    expect(e.cause).toBe(cause);
  });
});

describe('end-to-end: registry-emitted errors flow through the BrikaError surface', () => {
  test('a NOT_REGISTERED dispatch failure round-trips wire → response → match', async () => {
    const reg = new GrantRegistry();
    let thrown: unknown;
    try {
      await reg.dispatch('dev.brika.missing.grant', {}, handlerCtx());
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(GrantError);

    if (!(thrown instanceof GrantError)) {
      throw new Error('expected GrantError');
    }
    // Wire round-trip
    const wire = thrown.toWire();
    expect(isBrikaErrorWire(wire)).toBe(true);
    const restored = BrikaError.fromWire(wire);
    expect(restored.code).toBe('NOT_REGISTERED');

    // HTTP response shape
    const res = brikaErrorToResponse(thrown);
    expect(res.status).toBe(404);

    // match dispatch
    const view = matchBrikaError(thrown, {
      NOT_REGISTERED: (data) => `gone:${data.grantId}`,
      _: () => 'other',
    });
    expect(view).toBe('gone:dev.brika.missing.grant');
  });

  test('an INVALID_INPUT failure preserves the Zod cause across fromWire', async () => {
    const reg = new GrantRegistry();
    reg.register(noop);
    let thrown: unknown;
    try {
      await reg.dispatch('dev.brika.interop.noop', { value: 42 }, handlerCtx());
    } catch (e) {
      thrown = e;
    }
    if (!(thrown instanceof GrantError)) {
      throw new Error('expected GrantError');
    }
    expect(thrown.code).toBe('INVALID_INPUT');
    // The registry attaches the Zod error as cause — toWire flattens it.
    const wire = thrown.toWire();
    expect(wire.cause).toBeDefined();
  });

  test('a handler INTERNAL failure preserves the inner message across the wire', async () => {
    const reg = new GrantRegistry();
    const exploder = defineGrant(
      {
        id: 'dev.brika.interop.boom',
        args: z.object({}),
        result: z.object({}),
      },
      () => {
        throw new RangeError('out-of-range');
      }
    );
    reg.register(exploder);
    let thrown: unknown;
    try {
      await reg.dispatch('dev.brika.interop.boom', {}, handlerCtx());
    } catch (e) {
      thrown = e;
    }
    if (!(thrown instanceof GrantError)) {
      throw new Error('expected GrantError');
    }
    const wire = thrown.toWire();
    if (wire.cause && !('_brikaError' in wire.cause)) {
      expect(wire.cause.message).toBe('out-of-range');
      expect(wire.cause.name).toBe('RangeError');
    } else {
      throw new Error('expected flat cause frame');
    }
  });
});
