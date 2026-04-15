/**
 * Tests for SDK Error Types and RPC Error Mapping
 */

import { describe, expect, test } from 'bun:test';
import {
  InternalError,
  InvalidInputError,
  NotFoundError,
  PermissionDeniedError,
  rethrowRpcError,
  sdkErrors,
} from '../errors';

/** Create an error with a `code` and optional `data`, mimicking IPC's RpcError. */
function codedError(code: string, message: string, data?: Record<string, unknown>): Error {
  return Object.assign(new Error(message), { code, ...(data ? { data } : {}) });
}

// ─────────────────────────────────────────────────────────────────────────────
// PermissionDeniedError
// ─────────────────────────────────────────────────────────────────────────────

describe('PermissionDeniedError', () => {
  test('has correct name and permission field', () => {
    const err = new PermissionDeniedError('location');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PermissionDeniedError);
    expect(err.name).toBe('PermissionDeniedError');
    expect(err.permission).toBe('location');
  });

  test('includes permission in message', () => {
    const err = new PermissionDeniedError('location');
    expect(err.message).toContain('location');
    expect(err.message).toContain('permissions');
  });

  test('self-registers in sdkErrors registry', () => {
    const entry = sdkErrors.find((e) => e.rpcCode === 'PERMISSION_DENIED');
    expect(entry).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NotFoundError
// ─────────────────────────────────────────────────────────────────────────────

describe('NotFoundError', () => {
  test('has correct name and resource field', () => {
    const err = new NotFoundError('timer:block');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('NotFoundError');
    expect(err.resource).toBe('timer:block');
  });

  test('uses custom message when provided', () => {
    const err = new NotFoundError('x', 'custom message');
    expect(err.message).toBe('custom message');
  });

  test('self-registers in sdkErrors registry', () => {
    const entry = sdkErrors.find((e) => e.rpcCode === 'NOT_FOUND');
    expect(entry).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// InvalidInputError
// ─────────────────────────────────────────────────────────────────────────────

describe('InvalidInputError', () => {
  test('has correct name and field', () => {
    const err = new InvalidInputError('bad value', 'email');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('InvalidInputError');
    expect(err.field).toBe('email');
    expect(err.message).toContain('email');
  });

  test('works without field', () => {
    const err = new InvalidInputError('malformed');
    expect(err.field).toBeUndefined();
    expect(err.message).toBe('malformed');
  });

  test('self-registers in sdkErrors registry', () => {
    const entry = sdkErrors.find((e) => e.rpcCode === 'INVALID_INPUT');
    expect(entry).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// InternalError
// ─────────────────────────────────────────────────────────────────────────────

describe('InternalError', () => {
  test('has correct name and default message', () => {
    const err = new InternalError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('InternalError');
    expect(err.message).toContain('internal error');
  });

  test('accepts custom message', () => {
    const err = new InternalError('db crashed');
    expect(err.message).toBe('db crashed');
  });

  test('self-registers in sdkErrors registry', () => {
    const entry = sdkErrors.find((e) => e.rpcCode === 'INTERNAL');
    expect(entry).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rethrowRpcError (auto-mapping)
// ─────────────────────────────────────────────────────────────────────────────

describe('rethrowRpcError', () => {
  test('maps PERMISSION_DENIED to PermissionDeniedError', () => {
    const err = codedError('PERMISSION_DENIED', 'denied', { permission: 'location' });
    expect(() => rethrowRpcError(err)).toThrow(PermissionDeniedError);
    try {
      rethrowRpcError(err);
    } catch (err) {
      expect((err as PermissionDeniedError).permission).toBe('location');
    }
  });

  test('maps NOT_FOUND to NotFoundError', () => {
    const err = codedError('NOT_FOUND', 'gone', { resource: 'timer:block' });
    expect(() => rethrowRpcError(err)).toThrow(NotFoundError);
    try {
      rethrowRpcError(err);
    } catch (err) {
      expect((err as NotFoundError).resource).toBe('timer:block');
    }
  });

  test('maps INVALID_INPUT to InvalidInputError', () => {
    const err = codedError('INVALID_INPUT', 'bad', { field: 'email' });
    expect(() => rethrowRpcError(err)).toThrow(InvalidInputError);
    try {
      rethrowRpcError(err);
    } catch (err) {
      expect((err as InvalidInputError).field).toBe('email');
    }
  });

  test('maps INTERNAL to InternalError', () => {
    const err = codedError('INTERNAL', 'boom');
    expect(() => rethrowRpcError(err)).toThrow(InternalError);
  });

  test('falls back to "unknown" when data has no permission field', () => {
    const err = codedError('PERMISSION_DENIED', 'msg');
    try {
      rethrowRpcError(err);
    } catch (err) {
      expect((err as PermissionDeniedError).permission).toBe('unknown');
    }
  });

  test('rethrows unknown codes as-is', () => {
    const err = codedError('SOME_FUTURE_CODE', 'something');
    try {
      rethrowRpcError(err);
    } catch (err) {
      expect(err).toBe(err);
      expect((err as Record<string, unknown>).code).toBe('SOME_FUTURE_CODE');
    }
  });

  test('rethrows non-coded errors as-is', () => {
    const plain = new Error('plain error');
    try {
      rethrowRpcError(plain);
    } catch (err) {
      expect(err).toBe(plain);
    }
  });

  test('rethrows non-Error values as-is', () => {
    try {
      rethrowRpcError('string error');
    } catch (err) {
      expect(err).toBe('string error');
    }
  });

  test('always throws (never returns)', () => {
    expect(() => rethrowRpcError(new Error('x'))).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

describe('sdkErrors registry', () => {
  test('all 4 built-in errors are registered', () => {
    const codes = sdkErrors.map((e) => e.rpcCode);
    expect(codes).toContain('PERMISSION_DENIED');
    expect(codes).toContain('NOT_FOUND');
    expect(codes).toContain('INVALID_INPUT');
    expect(codes).toContain('INTERNAL');
  });

  test('dynamically registered error class is picked up', () => {
    class CustomError extends Error {
      static readonly rpcCode = 'CUSTOM_TEST';
      static fromCodedError(err: { message: string }) {
        return new CustomError(err.message);
      }
    }
    sdkErrors.push(CustomError);

    const err = codedError('CUSTOM_TEST', 'custom msg');
    try {
      rethrowRpcError(err);
    } catch (err) {
      expect(err).toBeInstanceOf(CustomError);
      expect((err as CustomError).message).toBe('custom msg');
    }

    // Cleanup
    const idx = sdkErrors.indexOf(CustomError);
    if (idx !== -1) {
      sdkErrors.splice(idx, 1);
    }
  });
});
