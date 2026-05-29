/**
 * Tests for workflow's error-catalog integration.
 *
 * Workflow's `validation/workspace.ts` resolves diagnostic severity through
 * `severityForCode` from `@brika/errors`. These tests pin that contract: every
 * code workflow emits resolves through the catalog (`severityForCode`,
 * `httpStatusForCode`, `isRetryable`, `lookupCatalogEntry`), the catalog's
 * `message()` builders return strings, and the `BrikaError` / factories /
 * wire / match plumbing round-trips for the few codes workflow callers might
 * actually throw (notFound / invalidInput / internal).
 */

import { describe, expect, test } from 'bun:test';
import {
  BrikaError,
  BrikaErrorWireSchema,
  brikaErrorToResponse,
  buildCustomError,
  buildError,
  ERROR_CATEGORIES,
  ERROR_SEVERITIES,
  ErrorCatalog,
  errors,
  httpStatusForCode,
  isBrikaErrorWire,
  isRetryable,
  lookupCatalogEntry,
  matchBrikaError,
  severityForCode,
} from '@brika/errors';

// Workflow diagnostic codes, mirrored from the public catalog. These are the
// codes the workflow validation pipeline pushes into `ValidationResult`.
const WORKFLOW_DIAG_CODES = [
  'WORKFLOW_UNKNOWN_BLOCK_TYPE',
  'WORKFLOW_UNKNOWN_OUTPUT_PORT',
  'WORKFLOW_UNKNOWN_INPUT_PORT',
  'WORKFLOW_UNKNOWN_TARGET_BLOCK_TYPE',
  'WORKFLOW_INVALID_PORT_REF',
  'WORKFLOW_TARGET_BLOCK_NOT_FOUND',
  'WORKFLOW_SOURCE_BLOCK_NOT_FOUND',
  'WORKFLOW_TARGET_PORT_NOT_FOUND',
  'WORKFLOW_INVALID_CONNECTION',
  'WORKFLOW_MISSING_BIDIRECTIONAL_REF',
  'WORKFLOW_ORPHAN_BLOCK',
] as const;

describe('catalog severity / status / retryable lookups', () => {
  test('every cataloged code resolves through severity/status/lookup helpers', () => {
    // Iterate over every entry in the catalog so message builders fire and
    // the severity / status / retryable helpers see every code shape. This
    // is the smoke that proves the catalog never has a malformed row.
    for (const code of Object.keys(ErrorCatalog)) {
      const entry = lookupCatalogEntry(code);
      expect(entry).toBeDefined();
      expect(ERROR_SEVERITIES).toContain(severityForCode(code));
      expect(typeof httpStatusForCode(code)).toBe('number');
      expect(typeof isRetryable(code)).toBe('boolean');
      // Catalog message builders accept undefined / record shapes — exercise
      // the call so the per-family files' anonymous closures count.
      const msg = entry?.message({});
      expect(typeof msg).toBe('string');
    }
  });

  test('every workflow diagnostic code is in the catalog', () => {
    for (const code of WORKFLOW_DIAG_CODES) {
      expect(lookupCatalogEntry(code)).toBeDefined();
    }
  });

  test('severityForCode returns a valid severity for cataloged codes', () => {
    for (const code of WORKFLOW_DIAG_CODES) {
      const sev = severityForCode(code);
      expect(ERROR_SEVERITIES).toContain(sev);
    }
  });

  test('severityForCode falls back to "error" for unknown codes', () => {
    expect(severityForCode('NOT_A_REAL_CODE')).toBe('error');
  });

  test('httpStatusForCode reflects catalog entry, defaults to 500', () => {
    expect(httpStatusForCode('WORKFLOW_UNKNOWN_BLOCK_TYPE')).toBe(400);
    expect(httpStatusForCode('NOT_A_REAL_CODE')).toBe(500);
  });

  test('isRetryable defaults to false for unknown codes', () => {
    expect(isRetryable('NOT_A_REAL_CODE')).toBe(false);
    // Workflow diagnostics are never retryable — they are user errors.
    expect(isRetryable('WORKFLOW_INVALID_CONNECTION')).toBe(false);
  });

  test('catalog entries expose a category drawn from ERROR_CATEGORIES', () => {
    for (const code of WORKFLOW_DIAG_CODES) {
      const entry = lookupCatalogEntry(code);
      expect(entry).toBeDefined();
      if (entry) {
        expect(ERROR_CATEGORIES).toContain(entry.category);
      }
    }
  });

  test('catalog message builders produce non-empty strings', () => {
    for (const code of WORKFLOW_DIAG_CODES) {
      const entry = lookupCatalogEntry(code);
      expect(entry).toBeDefined();
      const msg = entry?.message(undefined);
      expect(typeof msg).toBe('string');
      expect(msg?.length).toBeGreaterThan(0);
    }
  });

  test('every cataloged code is reachable via ErrorCatalog', () => {
    expect(Object.keys(ErrorCatalog).length).toBeGreaterThan(0);
    for (const code of WORKFLOW_DIAG_CODES) {
      expect(code in ErrorCatalog).toBe(true);
    }
  });
});

describe('BrikaError + factories + wire round-trip', () => {
  test('buildError constructs a typed BrikaError with catalog-derived message', () => {
    const err = buildError('NOT_FOUND', {
      resource: 'workflow:xyz',
    });
    expect(err).toBeInstanceOf(BrikaError);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toContain('workflow:xyz');
    expect(err.data?.resource).toBe('workflow:xyz');
  });

  test('buildError honours opts.message override', () => {
    const err = buildError('NOT_FOUND', { resource: 'r' }, { message: 'override' });
    expect(err.message).toBe('override');
  });

  test('buildError preserves cause', () => {
    const cause = new Error('boom');
    const err = buildError('NOT_FOUND', { resource: 'r' }, { cause });
    expect(err.cause).toBe(cause);
  });

  test('buildCustomError accepts ad-hoc codes', () => {
    const err = buildCustomError('PLUGIN_DEFINED_FOO', 'plugin foo failed', {
      data: {
        tag: 'foo',
      },
    });
    expect(err.code).toBe('PLUGIN_DEFINED_FOO');
    expect(err.message).toBe('plugin foo failed');
    expect(err.data?.tag).toBe('foo');
  });

  test('errors.internal returns a 500-status uncataloged-ish error', () => {
    const err = errors.internal();
    expect(err).toBeInstanceOf(BrikaError);
    expect(err.code).toBe('INTERNAL');
    expect(httpStatusForCode(err.code)).toBeGreaterThanOrEqual(500);
  });

  test('errors.invalidInput accepts default empty data', () => {
    const err = errors.invalidInput();
    expect(err.code).toBe('INVALID_INPUT');
  });

  test('errors.timeout default data', () => {
    const err = errors.timeout();
    expect(err.code).toBe('TIMEOUT');
  });

  test('every public factory returns a BrikaError with its expected code', () => {
    // Touch every factory so platform error contracts have at least one
    // smoke test from workflow's perspective. (Workflow consumers throw
    // these codes via the SDK runtime; this guards against silent rename.)
    const samples: ReadonlyArray<readonly [BrikaError, string]> = [
      [errors.internal(), 'INTERNAL'],
      [errors.invalidInput(), 'INVALID_INPUT'],
      [errors.notFound({ resource: 'r' }), 'NOT_FOUND'],
      [errors.permissionDenied({ permission: 'p' }), 'PERMISSION_DENIED'],
      [errors.timeout(), 'TIMEOUT'],
      [errors.unavailable(), 'UNAVAILABLE'],
      [errors.pluginNotFound({ pluginId: 'p' }), 'PLUGIN_NOT_FOUND'],
      [errors.pluginConfigInvalid({ pluginId: 'p' }), 'PLUGIN_CONFIG_INVALID'],
      [errors.manifestInvalid({ manifestPath: '/p' }), 'MANIFEST_INVALID'],
      [errors.manifestMissingMain({ manifestPath: '/p' }), 'MANIFEST_MISSING_MAIN'],
      [errors.alreadyRegistered({ grantId: 'g' }), 'ALREADY_REGISTERED'],
      [errors.notRegistered({ grantId: 'g' }), 'NOT_REGISTERED'],
      [errors.invalidOutput({ grantId: 'g' }), 'INVALID_OUTPUT'],
      [errors.invalidScope({ grantId: 'g' }), 'INVALID_SCOPE'],
      [errors.netHostNotAllowed({ host: 'h', allow: [] }), 'NET_HOST_NOT_ALLOWED'],
      [errors.netProtocolBlocked({ protocol: 'file:' }), 'NET_PROTOCOL_BLOCKED'],
      [
        errors.netPrivateIpBlocked({ host: 'h', ip: '127.0.0.1', category: 'loopback' }),
        'NET_PRIVATE_IP_BLOCKED',
      ],
      [errors.netRedirectBlocked({ from: 'a', to: 'b', allow: [] }), 'NET_REDIRECT_BLOCKED'],
      [errors.netRedirectLoop({ url: 'https://x/', hops: 5 }), 'NET_REDIRECT_LOOP'],
      [errors.netBodyTooLarge({ limit: 10, received: 11 }), 'NET_BODY_TOO_LARGE'],
      [errors.fsPathOutsideRoot({ path: '/etc/passwd' }), 'FS_PATH_OUTSIDE_ROOT'],
      [errors.fsSymlinkEscape({ path: '/data/x' }), 'FS_SYMLINK_ESCAPE'],
      [errors.fsQuotaExceeded({ root: '/data', limit: 10, requested: 20 }), 'FS_QUOTA_EXCEEDED'],
      [errors.fsFileTooLarge({ limit: 10, requested: 20 }), 'FS_FILE_TOO_LARGE'],
      [errors.fsAlreadyExists({ path: '/data/x' }), 'FS_ALREADY_EXISTS'],
      [errors.fsNotFound({ path: '/data/x' }), 'FS_NOT_FOUND'],
      [errors.wsOpenLimitExceeded({ limit: 8 }), 'WS_OPEN_LIMIT_EXCEEDED'],
      [errors.wsHandleNotFound({ handleId: 'ws_x' }), 'WS_HANDLE_NOT_FOUND'],
      [errors.wsFrameTooLarge({ limit: 10, requested: 11 }), 'WS_FRAME_TOO_LARGE'],
    ];

    for (const [err, code] of samples) {
      expect(err).toBeInstanceOf(BrikaError);
      expect(err.code).toBe(code);
    }
  });

  test('BrikaError.is narrows by code', () => {
    const err = buildError('NOT_FOUND', { resource: 'x' });
    expect(BrikaError.is(err, 'NOT_FOUND')).toBe(true);
    expect(BrikaError.is(err, 'INTERNAL')).toBe(false);
    expect(BrikaError.is(new Error('plain'), 'NOT_FOUND')).toBe(false);
  });

  test('BrikaError.toWire / fromWire round-trip', () => {
    const original = buildError('NOT_FOUND', { resource: 'x' });
    const wire = original.toWire();
    expect(wire._brikaError).toBe(true);
    expect(wire.code).toBe('NOT_FOUND');
    expect(wire.data?.resource).toBe('x');

    const back = BrikaError.fromWire(wire);
    expect(back).toBeInstanceOf(BrikaError);
    expect(back.code).toBe('NOT_FOUND');
    expect(back.data?.resource).toBe('x');
  });

  test('toWire serializes a nested BrikaError cause', () => {
    const inner = buildError('NOT_FOUND', { resource: 'inner' });
    const outer = buildError('INTERNAL', undefined, { cause: inner });
    const wire = outer.toWire();
    expect(wire.cause).toBeDefined();
    // Nested cause should itself be a BrikaError wire envelope.
    const parsed = BrikaErrorWireSchema.safeParse(wire.cause);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.code).toBe('NOT_FOUND');
    }
  });

  test('toWire serializes a plain Error cause as a flat frame', () => {
    const inner = new TypeError('boom');
    const err = buildError('INTERNAL', undefined, { cause: inner });
    const wire = err.toWire();
    expect(wire.cause).toMatchObject({
      message: 'boom',
      name: 'TypeError',
    });
  });

  test('toWire optionally includes a stack trace', () => {
    const err = buildError('INTERNAL', undefined);
    const wire = err.toWire({ includeStack: true });
    expect(typeof wire.stack).toBe('string');
    const wireNoStack = err.toWire();
    expect(wireNoStack.stack).toBeUndefined();
  });

  test('isBrikaErrorWire rejects non-envelope values', () => {
    expect(isBrikaErrorWire(null)).toBe(false);
    expect(isBrikaErrorWire({})).toBe(false);
    expect(
      isBrikaErrorWire({
        _brikaError: false,
        code: 'X',
        message: 'm',
      })
    ).toBe(false);
    expect(
      isBrikaErrorWire({
        _brikaError: true,
        code: 'X',
        message: 'm',
      })
    ).toBe(true);
  });

  test('fromWire reconstructs a nested cause chain', () => {
    const wire = {
      _brikaError: true as const,
      code: 'INTERNAL',
      message: 'outer',
      cause: {
        _brikaError: true as const,
        code: 'NOT_FOUND',
        message: 'inner',
        data: {
          resource: 'r',
        },
      },
    };
    const err = BrikaError.fromWire(wire);
    expect(err.cause).toBeInstanceOf(BrikaError);
    if (err.cause instanceof BrikaError) {
      expect(err.cause.code).toBe('NOT_FOUND');
      expect(err.cause.data?.resource).toBe('r');
    }
  });

  test('onThrow handler fires on construction and clearThrowHandlers resets', () => {
    const seen: string[] = [];
    const off = BrikaError.onThrow((err) => seen.push(err.code));
    buildError('NOT_FOUND', { resource: 'a' });
    buildError('NOT_FOUND', { resource: 'b' });
    expect(seen).toEqual(['NOT_FOUND', 'NOT_FOUND']);
    off();
    buildError('NOT_FOUND', { resource: 'c' });
    expect(seen).toEqual(['NOT_FOUND', 'NOT_FOUND']);

    // clearThrowHandlers should drop any lingering subscribers.
    BrikaError.onThrow(() => seen.push('extra'));
    BrikaError.clearThrowHandlers();
    buildError('NOT_FOUND', { resource: 'd' });
    expect(seen).toEqual(['NOT_FOUND', 'NOT_FOUND']);
  });

  test('a throwing onThrow handler is swallowed without breaking construction', () => {
    const off = BrikaError.onThrow(() => {
      throw new Error('handler-boom');
    });
    // Construction succeeds and returns a typed BrikaError, despite the
    // handler raising. We deliberately swallow the return value so a future
    // change to `not.toThrow` semantics can't mis-flag a returned Error.
    let constructed: BrikaError | null = null;
    const safelyBuild = (): void => {
      constructed = buildError('NOT_FOUND', { resource: 'safe' });
    };
    expect(safelyBuild).not.toThrow();
    expect(constructed).toBeInstanceOf(BrikaError);
    off();
  });
});

describe('matchBrikaError', () => {
  test('routes to the matching per-code handler', () => {
    const err = buildError('NOT_FOUND', { resource: 'x' });
    const out = matchBrikaError(err, {
      NOT_FOUND: ({ resource }) => `not found: ${resource}`,
      _: () => 'fallback',
    });
    expect(out).toBe('not found: x');
  });

  test('falls back to _ for unhandled cataloged codes', () => {
    const err = buildError('INTERNAL', undefined);
    const out = matchBrikaError(err, {
      NOT_FOUND: () => 'nf',
      _: () => 'fallback',
    });
    expect(out).toBe('fallback');
  });

  test('falls back to _ for non-BrikaError values', () => {
    expect(
      matchBrikaError(new Error('plain'), {
        _: () => 'fallback',
      })
    ).toBe('fallback');
    expect(
      matchBrikaError('string', {
        _: () => 'fallback',
      })
    ).toBe('fallback');
    expect(
      matchBrikaError(undefined, {
        _: () => 'fallback',
      })
    ).toBe('fallback');
  });

  test('treats a non-function handler as missing', () => {
    const err = buildError('NOT_FOUND', { resource: 'x' });
    const handlers = {
      NOT_FOUND: 'not a function',
      _: () => 'fallback',
    } as unknown as Parameters<typeof matchBrikaError<string>>[1];
    expect(matchBrikaError(err, handlers)).toBe('fallback');
  });
});

describe('brikaErrorToResponse (RFC 9457)', () => {
  test('returns a problem+json response for a BrikaError', async () => {
    const err = buildError('NOT_FOUND', { resource: 'workflow:foo' });
    const res = brikaErrorToResponse(err, {
      traceId: 'trace-123',
      instance: '/workflows/foo',
    });

    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain('application/problem+json');
    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
    expect(body.detail).toContain('workflow:foo');
    expect(body.traceId).toBe('trace-123');
    expect(body.instance).toBe('/workflows/foo');
    expect(typeof body.title).toBe('string');
    expect(typeof body.type).toBe('string');
  });

  test('collapses a non-BrikaError to a 500 envelope', async () => {
    const res = brikaErrorToResponse(new Error('boom'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('INTERNAL');
    expect(body.retryable).toBe(false);
  });

  test('uncataloged BrikaError gets default type/title and 500', async () => {
    const err = buildCustomError('CUSTOM_NOT_IN_CATALOG', 'oops');
    const res = brikaErrorToResponse(err);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('CUSTOM_NOT_IN_CATALOG');
    expect(body.detail).toBe('oops');
    expect(body.type).toBe('about:blank');
  });
});
