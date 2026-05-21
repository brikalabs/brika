/**
 * Tests for SDK Error Types
 *
 * The SDK error classes are convenience constructors that extend `BrikaError`.
 * They auto-populate the catalog-typed `data` payload and set `code` to the
 * matching catalog entry. Wire round-trip is tested in `@brika/ipc`.
 */

import { describe, expect, test } from 'bun:test';
import { BrikaError } from '@brika/ipc';
import {
  InternalError,
  InvalidInputError,
  NotFoundError,
  PermissionDeniedError,
  TimeoutError,
} from '../errors';

describe('PermissionDeniedError', () => {
  test('extends BrikaError and sets the catalog code', () => {
    const err = new PermissionDeniedError('location');
    expect(err).toBeInstanceOf(BrikaError);
    expect(err).toBeInstanceOf(PermissionDeniedError);
    expect(err.name).toBe('PermissionDeniedError');
    expect(err.code).toBe('PERMISSION_DENIED');
    expect(err.permission).toBe('location');
  });

  test('carries the permission field on `data`', () => {
    const err = new PermissionDeniedError('secrets');
    expect(err.data).toEqual({ permission: 'secrets' });
  });

  test('BrikaError.is narrows code + data after wire round-trip', () => {
    const original = new PermissionDeniedError('location');
    const restored = BrikaError.fromWire(original.toWire());

    if (!BrikaError.is(restored, 'PERMISSION_DENIED')) {
      throw new Error('expected PERMISSION_DENIED after round-trip');
    }
    expect(restored.data?.permission).toBe('location');
  });

  test('mentions the permission in the message', () => {
    const err = new PermissionDeniedError('location');
    expect(err.message).toContain('location');
    expect(err.message).toContain('permissions');
  });
});

describe('NotFoundError', () => {
  test('extends BrikaError, code NOT_FOUND, resource on data', () => {
    const err = new NotFoundError('timer:block');
    expect(err).toBeInstanceOf(BrikaError);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('NotFoundError');
    expect(err.resource).toBe('timer:block');
    expect(err.data).toEqual({ resource: 'timer:block' });
  });

  test('uses custom message when provided', () => {
    const err = new NotFoundError('x', 'custom message');
    expect(err.message).toBe('custom message');
  });
});

describe('InvalidInputError', () => {
  test('extends BrikaError, code INVALID_INPUT, carries field', () => {
    const err = new InvalidInputError('bad value', 'email');
    expect(err).toBeInstanceOf(BrikaError);
    expect(err.code).toBe('INVALID_INPUT');
    expect(err.field).toBe('email');
    expect(err.message).toContain('email');
    expect(err.data).toEqual({ field: 'email' });
  });

  test('works without field', () => {
    const err = new InvalidInputError('malformed');
    expect(err.field).toBeUndefined();
    expect(err.message).toBe('malformed');
    expect(err.data).toBeUndefined();
  });
});

describe('InternalError', () => {
  test('extends BrikaError, code INTERNAL', () => {
    const err = new InternalError();
    expect(err).toBeInstanceOf(BrikaError);
    expect(err.code).toBe('INTERNAL');
    expect(err.name).toBe('InternalError');
    expect(err.message).toContain('internal error');
  });

  test('accepts custom message and cause', () => {
    const cause = new Error('underlying');
    const err = new InternalError('db crashed', cause);
    expect(err.message).toBe('db crashed');
    expect(err.cause).toBe(cause);
  });
});

describe('TimeoutError', () => {
  test('extends BrikaError, code TIMEOUT', () => {
    const err = new TimeoutError({ operation: 'fetch', timeoutMs: 5000 });
    expect(err).toBeInstanceOf(BrikaError);
    expect(err.code).toBe('TIMEOUT');
    expect(err.name).toBe('TimeoutError');
    expect(err.operation).toBe('fetch');
    expect(err.timeoutMs).toBe(5000);
    expect(err.message).toContain('fetch');
    expect(err.message).toContain('5000');
    expect(err.data).toEqual({ operation: 'fetch', timeoutMs: 5000 });
  });

  test('formats message without operation/timeoutMs', () => {
    const err = new TimeoutError();
    expect(err.message).toBe('Operation timed out.');
    expect(err.operation).toBeUndefined();
    expect(err.timeoutMs).toBeUndefined();
  });

  test('round-trips data via the wire format', () => {
    const original = new TimeoutError({ operation: 'fetch', timeoutMs: 5000 });
    const restored = BrikaError.fromWire(original.toWire());
    if (!BrikaError.is(restored, 'TIMEOUT')) {
      throw new Error('expected TIMEOUT after round-trip');
    }
    expect(restored.data?.operation).toBe('fetch');
    expect(restored.data?.timeoutMs).toBe(5000);
  });
});
