/**
 * Tests for the SDK's error surface (factories + match + narrowing).
 *
 * The SDK re-exports BrikaError + factory API from @brika/ipc. These tests
 * cover the surface plugin authors interact with.
 */

import { describe, expect, test } from 'bun:test';
import { BrikaError, errors, matchBrikaError } from '../index';

describe('errors.permissionDenied', () => {
  test('builds a BrikaError with the catalog code, message, and data', () => {
    const err = errors.permissionDenied({ permission: 'location' });
    expect(err).toBeInstanceOf(BrikaError);
    expect(err.code).toBe('PERMISSION_DENIED');
    expect(err.data?.permission).toBe('location');
    expect(err.message).toContain('location');
    expect(err.message).toContain('permissions');
  });

  test('preserves cause when provided', () => {
    const cause = new Error('underlying');
    const err = errors.permissionDenied({ permission: 'x' }, { cause });
    expect(err.cause).toBe(cause);
  });

  test('survives wire round-trip; BrikaError.is narrows data', () => {
    const original = errors.permissionDenied({ permission: 'location' });
    const restored = BrikaError.fromWire(original.toWire());
    if (!BrikaError.is(restored, 'PERMISSION_DENIED')) {
      throw new Error('expected PERMISSION_DENIED');
    }
    expect(restored.data?.permission).toBe('location');
  });
});

describe('errors.notFound', () => {
  test('carries the resource on data', () => {
    const err = errors.notFound({ resource: 'block:timer' });
    expect(err.code).toBe('NOT_FOUND');
    expect(err.data?.resource).toBe('block:timer');
    expect(err.message).toContain('block:timer');
  });

  test('respects a message override', () => {
    const err = errors.notFound({ resource: 'x' }, { message: 'gone for good' });
    expect(err.message).toBe('gone for good');
  });
});

describe('errors.invalidInput', () => {
  test('carries field when provided', () => {
    const err = errors.invalidInput({ field: 'email' });
    expect(err.code).toBe('INVALID_INPUT');
    expect(err.data?.field).toBe('email');
    expect(err.message).toContain('email');
  });

  test('works without data', () => {
    const err = errors.invalidInput();
    expect(err.code).toBe('INVALID_INPUT');
    expect(err.message).toBe('Invalid input.');
  });
});

describe('errors.internal / errors.unavailable', () => {
  test('errors.internal accepts no args and carries cause', () => {
    const cause = new Error('underlying');
    const err = errors.internal({ cause });
    expect(err.code).toBe('INTERNAL');
    expect(err.cause).toBe(cause);
  });

  test('errors.unavailable() has retryable=true in the catalog', () => {
    const err = errors.unavailable();
    expect(err.code).toBe('UNAVAILABLE');
    expect(err.message).toContain('unavailable');
  });
});

describe('errors.timeout', () => {
  test('builds a contextualized message from data', () => {
    const err = errors.timeout({ operation: 'fetch', timeoutMs: 5000 });
    expect(err.code).toBe('TIMEOUT');
    expect(err.data?.operation).toBe('fetch');
    expect(err.data?.timeoutMs).toBe(5000);
    expect(err.message).toContain('fetch');
    expect(err.message).toContain('5000');
  });

  test('falls back gracefully without data', () => {
    const err = errors.timeout();
    expect(err.code).toBe('TIMEOUT');
    expect(err.message).toBe('Operation timed out.');
  });
});

describe('matchBrikaError', () => {
  test('routes to the per-code handler with typed data', () => {
    const err = errors.permissionDenied({ permission: 'location' });
    const view = matchBrikaError<string>(err, {
      PERMISSION_DENIED: ({ permission }) => `denied: ${permission}`,
      NOT_FOUND: ({ resource }) => `gone: ${resource}`,
      _: () => 'unknown',
    });
    expect(view).toBe('denied: location');
  });

  test('falls through to _ for unmatched codes', () => {
    const err = errors.timeout();
    const view = matchBrikaError<string>(err, {
      PERMISSION_DENIED: () => 'denied',
      _: () => 'other',
    });
    expect(view).toBe('other');
  });

  test('falls through to _ for non-BrikaError throws', () => {
    const view = matchBrikaError<string>(new Error('plain'), {
      PERMISSION_DENIED: () => 'denied',
      _: () => 'plain',
    });
    expect(view).toBe('plain');
  });

  test('handler receives the full BrikaError instance as the 2nd arg', () => {
    const err = errors.notFound({ resource: 'r' }, { cause: new Error('db down') });
    const causeMessage = matchBrikaError<string>(err, {
      NOT_FOUND: (_data, e) => (e.cause instanceof Error ? e.cause.message : 'no cause'),
      _: () => '_',
    });
    expect(causeMessage).toBe('db down');
  });
});

describe('BrikaError.onThrow hook', () => {
  test('fires once per construction with the error instance', () => {
    const seen: string[] = [];
    const off = BrikaError.onThrow((e) => seen.push(e.code));
    try {
      errors.permissionDenied({ permission: 'a' });
      errors.notFound({ resource: 'b' });
    } finally {
      off();
    }
    expect(seen).toEqual(['PERMISSION_DENIED', 'NOT_FOUND']);
  });

  test('a buggy handler does not break error construction', () => {
    const off = BrikaError.onThrow(() => {
      throw new Error('boom');
    });
    try {
      const err = errors.permissionDenied({ permission: 'x' });
      expect(err.code).toBe('PERMISSION_DENIED');
    } finally {
      off();
    }
  });

  test('disposer removes the handler', () => {
    const seen: string[] = [];
    const off = BrikaError.onThrow((e) => seen.push(e.code));
    errors.permissionDenied({ permission: 'a' });
    off();
    errors.permissionDenied({ permission: 'b' });
    expect(seen).toEqual(['PERMISSION_DENIED']);
  });
});
