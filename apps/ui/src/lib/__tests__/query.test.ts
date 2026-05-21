/**
 * Tests for the FE error consumption layer.
 *
 * Covers:
 * - BrikaApiError construction
 * - isBrikaApiError narrowing (code + typed data)
 * - readErrorResponse fallback paths (empty body, non-JSON, non-envelope JSON)
 * - retryable hint surfaces correctly
 */

import { describe, expect, test } from 'bun:test';
import { ApiError, BrikaApiError, isBrikaApiError, readErrorResponse } from '../query';

describe('BrikaApiError', () => {
  test('is an instanceof ApiError so existing catches still match', () => {
    const err = new BrikaApiError({
      status: 403,
      code: 'PERMISSION_DENIED',
      type: 'https://brika.dev/errors/permission-denied',
      title: 'Permission denied',
      detail: 'No.',
      retryable: false,
    });
    expect(err).toBeInstanceOf(BrikaApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('BrikaApiError');
    expect(err.status).toBe(403);
    expect(err.message).toBe('No.');
  });

  test('carries RFC 9457 fields + Brika extensions', () => {
    const err = new BrikaApiError({
      status: 403,
      code: 'PERMISSION_DENIED',
      type: 'https://brika.dev/errors/permission-denied',
      title: 'Permission denied',
      detail: 'denied',
      retryable: false,
      data: { permission: 'location' },
      i18nKey: 'errors.permission_denied',
      traceId: 'req-1',
      instance: '/api/x',
    });
    expect(err.type).toBe('https://brika.dev/errors/permission-denied');
    expect(err.title).toBe('Permission denied');
    expect(err.detail).toBe('denied');
    expect(err.data).toEqual({ permission: 'location' });
    expect(err.i18nKey).toBe('errors.permission_denied');
    expect(err.traceId).toBe('req-1');
    expect(err.instance).toBe('/api/x');
    expect(err.retryable).toBe(false);
  });
});

describe('isBrikaApiError', () => {
  test('matches on code', () => {
    const err = new BrikaApiError({
      status: 404,
      code: 'NOT_FOUND',
      type: 'https://brika.dev/errors/not-found',
      title: 'Not found',
      detail: 'gone',
      retryable: false,
      data: { resource: 'block:x' },
    });
    if (!isBrikaApiError(err, 'NOT_FOUND')) {
      throw new Error('expected NOT_FOUND narrowing');
    }
    // Type-narrowed: data.resource is string.
    expect(err.data?.resource).toBe('block:x');
  });

  test('rejects mismatched codes', () => {
    const err = new BrikaApiError({
      status: 404,
      code: 'NOT_FOUND',
      type: 'https://brika.dev/errors/not-found',
      title: 'Not found',
      detail: 'gone',
      retryable: false,
    });
    expect(isBrikaApiError(err, 'PERMISSION_DENIED')).toBe(false);
  });

  test('rejects non-BrikaApiError values', () => {
    expect(isBrikaApiError(new Error('plain'), 'NOT_FOUND')).toBe(false);
    expect(isBrikaApiError(new ApiError(500, 'oops'), 'NOT_FOUND')).toBe(false);
    expect(isBrikaApiError(null, 'NOT_FOUND')).toBe(false);
    expect(isBrikaApiError({ code: 'NOT_FOUND' }, 'NOT_FOUND')).toBe(false);
  });
});

describe('retryable hint', () => {
  test('retryable=true surfaces from the envelope', () => {
    const err = new BrikaApiError({
      status: 504,
      code: 'TIMEOUT',
      type: 'https://brika.dev/errors/timeout',
      title: 'Timeout',
      detail: 'slow',
      retryable: true,
    });
    expect(err.retryable).toBe(true);
  });
});

describe('readErrorResponse', () => {
  test('parses an RFC 9457 envelope into BrikaApiError', async () => {
    const envelope = {
      type: 'https://brika.dev/errors/permission-denied',
      title: 'Permission denied',
      status: 403,
      detail: 'denied',
      code: 'PERMISSION_DENIED',
      retryable: false,
      data: { permission: 'location' },
      i18nKey: 'errors.permission_denied',
    };
    const res = new Response(JSON.stringify(envelope), {
      status: 403,
      headers: { 'Content-Type': 'application/problem+json' },
    });
    const err = await readErrorResponse(res);
    expect(err).toBeInstanceOf(BrikaApiError);
    if (!(err instanceof BrikaApiError)) {
      throw new Error('expected BrikaApiError');
    }
    expect(err.code).toBe('PERMISSION_DENIED');
    expect(err.data?.permission).toBe('location');
    expect(err.detail).toBe('denied');
    expect(err.retryable).toBe(false);
  });

  test('returns ApiError for non-envelope JSON body', async () => {
    const res = new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
    const err = await readErrorResponse(res);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(BrikaApiError);
  });

  test('returns ApiError with text body for non-JSON response', async () => {
    const res = new Response('Internal Server Error', { status: 500 });
    const err = await readErrorResponse(res);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(BrikaApiError);
    expect(err.message).toBe('Internal Server Error');
  });

  test('returns ApiError with statusText for empty body', async () => {
    const res = new Response('', { status: 404, statusText: 'Not Found' });
    const err = await readErrorResponse(res);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('Not Found');
  });
});
