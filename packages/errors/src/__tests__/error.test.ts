import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { BrikaError, BrikaErrorWireSchema, isBrikaErrorWire } from '../error';
import { brikaErrorToResponse } from '../http';

describe('BrikaError', () => {
  it('stores code, message, and frozen data', () => {
    const err = new BrikaError('PERMISSION_DENIED', 'denied', {
      data: { permission: 'location' },
    });

    expect(err.code).toBe('PERMISSION_DENIED');
    expect(err.message).toBe('denied');
    expect(err.data).toEqual({ permission: 'location' });
    expect(Object.isFrozen(err.data)).toBe(true);
  });

  it('preserves cause chain via ES2022 cause option', () => {
    const underlying = new Error('underlying');
    const err = new BrikaError('INTERNAL', 'wrapped', { cause: underlying });

    expect(err.cause).toBe(underlying);
  });

  it('round-trips through the wire format', () => {
    const original = new BrikaError('NOT_FOUND', 'no such resource', {
      data: { resource: 'plugin-x' },
    });
    const wire = original.toWire();

    expect(wire._brikaError).toBe(true);
    expect(wire.code).toBe('NOT_FOUND');
    expect(wire.data).toEqual({ resource: 'plugin-x' });

    const restored = BrikaError.fromWire(wire);
    expect(restored).toBeInstanceOf(BrikaError);
    expect(restored.code).toBe('NOT_FOUND');
    expect(restored.message).toBe('no such resource');
    expect(restored.data).toEqual({ resource: 'plugin-x' });
  });

  it('round-trips nested BrikaError causes', () => {
    const inner = new BrikaError('INVALID_INPUT', 'bad field', { data: { field: 'name' } });
    const outer = new BrikaError('INTERNAL', 'outer', { cause: inner });

    const restored = BrikaError.fromWire(outer.toWire());

    expect(restored.cause).toBeInstanceOf(BrikaError);
    const cause = restored.cause;
    if (cause instanceof BrikaError) {
      expect(cause.code).toBe('INVALID_INPUT');
      expect(cause.data).toEqual({ field: 'name' });
    }
  });

  it('does not stack-overflow on circular cause chains', () => {
    interface Mutable {
      cause?: unknown;
    }
    const a: BrikaError & Mutable = new BrikaError('INTERNAL', 'a');
    const b: BrikaError & Mutable = new BrikaError('INTERNAL', 'b', { cause: a });
    a.cause = b;

    const wire = a.toWire();
    // The chain terminates at the first repeat with a flat sentinel frame.
    expect(JSON.stringify(wire)).toContain('[circular cause]');
  });

  it('flattens plain Error causes to message + name', () => {
    const inner = new TypeError('boom');
    const outer = new BrikaError('INTERNAL', 'outer', { cause: inner });

    const wire = outer.toWire();
    const wireCause = wire.cause;
    if (wireCause && !('_brikaError' in wireCause)) {
      expect(wireCause.message).toBe('boom');
      expect(wireCause.name).toBe('TypeError');
    } else {
      throw new Error('expected flat cause frame');
    }

    const restored = BrikaError.fromWire(wire);
    expect(restored.cause).toBeInstanceOf(Error);
  });

  it('includes stack only when requested', () => {
    const err = new BrikaError('INTERNAL', 'with stack');
    expect(err.toWire().stack).toBeUndefined();
    expect(err.toWire({ includeStack: true }).stack).toContain('with stack');
  });

  describe('static is()', () => {
    it('narrows code and data when the catalog schema matches', () => {
      const err: unknown = new BrikaError('PERMISSION_DENIED', 'denied', {
        data: { permission: 'location' },
      });

      if (BrikaError.is(err, 'PERMISSION_DENIED')) {
        // Narrowed: err.data.permission is a string per the catalog schema.
        expect(err.data?.permission).toBe('location');
      } else {
        throw new Error('is() should have matched');
      }
    });

    it('returns false when code mismatches', () => {
      const err = new BrikaError('NOT_FOUND', 'gone', { data: { resource: 'x' } });
      expect(BrikaError.is(err, 'PERMISSION_DENIED')).toBe(false);
    });

    it('returns false when data shape fails the catalog schema', () => {
      const err = new BrikaError('PERMISSION_DENIED', 'denied');
      expect(BrikaError.is(err, 'PERMISSION_DENIED')).toBe(false);
    });

    it('returns false for non-BrikaError values', () => {
      expect(BrikaError.is(new Error('plain'), 'INTERNAL')).toBe(false);
      expect(BrikaError.is(null, 'INTERNAL')).toBe(false);
      expect(BrikaError.is({ code: 'INTERNAL' }, 'INTERNAL')).toBe(false);
    });

    it('matches catalog codes without a data schema regardless of data', () => {
      const err = new BrikaError('UNAVAILABLE', 'down');
      expect(BrikaError.is(err, 'UNAVAILABLE')).toBe(true);
    });
  });
});

describe('isBrikaErrorWire / schema', () => {
  it('accepts a minimal envelope', () => {
    expect(
      isBrikaErrorWire({
        _brikaError: true,
        code: 'INTERNAL',
        message: 'x',
      })
    ).toBe(true);
  });

  it('rejects values missing the discriminator', () => {
    expect(isBrikaErrorWire({ code: 'INTERNAL', message: 'x' })).toBe(false);
    expect(isBrikaErrorWire({ _brikaError: false, code: 'INTERNAL', message: 'x' })).toBe(false);
    expect(isBrikaErrorWire(null)).toBe(false);
    expect(isBrikaErrorWire('string')).toBe(false);
  });

  it('parses with the exported schema', () => {
    const parsed = BrikaErrorWireSchema.safeParse({
      _brikaError: true,
      code: 'NOT_FOUND',
      message: 'missing',
      data: { resource: 'r' },
    });
    expect(parsed.success).toBe(true);
  });
});

describe('brikaErrorToResponse (RFC 9457)', () => {
  const ProblemSchema = z.object({
    type: z.string(),
    title: z.string(),
    status: z.number(),
    detail: z.string(),
    code: z.string(),
    retryable: z.boolean(),
    data: z.record(z.string(), z.unknown()).optional(),
    i18nKey: z.string().optional(),
    developerHint: z.string().optional(),
    instance: z.string().optional(),
    traceId: z.string().optional(),
  });

  it('emits an RFC 9457 problem+json envelope for catalogued codes', async () => {
    const res = brikaErrorToResponse(
      new BrikaError('PERMISSION_DENIED', 'Permission required', {
        data: { permission: 'location' },
      })
    );
    expect(res.status).toBe(403);
    expect(res.headers.get('Content-Type')).toBe('application/problem+json');
    const body = ProblemSchema.parse(await res.json());
    expect(body.code).toBe('PERMISSION_DENIED');
    expect(body.type).toBe('https://brika.dev/errors/permission-denied');
    expect(body.title).toBe('Permission denied');
    expect(body.status).toBe(403);
    expect(body.detail).toBe('Permission required');
    expect(body.data).toEqual({ permission: 'location' });
    expect(body.i18nKey).toBe('errors.permission_denied');
    expect(body.retryable).toBe(false);
  });

  it('marks retryable codes accordingly', async () => {
    const res = brikaErrorToResponse(
      new BrikaError('TIMEOUT', 'slow', { data: { timeoutMs: 5000 } })
    );
    const body = ProblemSchema.parse(await res.json());
    expect(body.retryable).toBe(true);
    expect(body.status).toBe(504);
  });

  it('includes traceId + instance when provided', async () => {
    const res = brikaErrorToResponse(
      new BrikaError('NOT_FOUND', 'gone', { data: { resource: 'x' } }),
      {
        traceId: 'req-123',
        instance: '/api/x',
      }
    );
    const body = ProblemSchema.parse(await res.json());
    expect(body.traceId).toBe('req-123');
    expect(body.instance).toBe('/api/x');
  });

  it('falls back to about:blank type for uncataloged codes', async () => {
    const res = brikaErrorToResponse(new BrikaError('PLUGIN_DEFINED_CODE', 'oops'));
    expect(res.status).toBe(500);
    const body = ProblemSchema.parse(await res.json());
    expect(body.type).toBe('about:blank');
    expect(body.code).toBe('PLUGIN_DEFINED_CODE');
  });

  it('returns 500 with a generic message for non-BrikaError throws', async () => {
    const res = brikaErrorToResponse(new Error('leaky secret'));
    expect(res.status).toBe(500);
    const body = ProblemSchema.parse(await res.json());
    expect(body.code).toBe('INTERNAL');
    expect(body.detail).toBe('Internal server error');
    expect(body.retryable).toBe(false);
  });
});
