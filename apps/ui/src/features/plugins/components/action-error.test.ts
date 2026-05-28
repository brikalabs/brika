/**
 * Unit tests for the pure helpers in `action-error.ts`. The React
 * hooks that wrap them are covered end-to-end by the playground UI;
 * the helpers themselves are deterministic and stay testable in
 * isolation.
 */

import { describe, expect, mock, test } from 'bun:test';

// Stub the clay toast surface so we can observe the dispatcher's
// decisions without depending on a real React renderer.
const toastError = mock(() => {
  /* noop */
});
mock.module('@brika/clay', () => ({
  toast: { error: toastError },
}));

const { ActionError, encodeActionInput, handleActionError, parseActionError } = await import(
  './action-error'
);

describe('parseActionError', () => {
  test('keeps the status when the server sent no body', () => {
    const err = parseActionError({}, 503);
    expect(err).toBeInstanceOf(ActionError);
    expect(err.status).toBe(503);
    expect(err.message).toBe('Action failed (503)');
  });

  test('honours a string envelope', () => {
    const err = parseActionError({ error: 'plain text fail' }, 500);
    expect(err.message).toBe('plain text fail');
    expect(err.status).toBe(500);
  });

  test('lifts code, name, and data from a structured envelope', () => {
    const err = parseActionError(
      {
        error: {
          message: 'permission denied',
          name: 'BrikaError',
          code: 'PERMISSION_DENIED',
          data: { permission: 'fs.read' },
        },
      },
      403
    );
    expect(err.message).toBe('permission denied');
    expect(err.originalName).toBe('BrikaError');
    expect(err.code).toBe('PERMISSION_DENIED');
    expect(err.data).toEqual({ permission: 'fs.read' });
  });
});

describe('handleActionError', () => {
  test('toasts by default', () => {
    toastError.mockClear();
    handleActionError(new ActionError('boom', { status: 500 }), undefined);
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  test('suppresses the toast when toastOnError is false', () => {
    toastError.mockClear();
    handleActionError(new ActionError('boom', { status: 500 }), { toastOnError: false });
    expect(toastError).not.toHaveBeenCalled();
  });

  test('runs the custom onError hook and skips the default toast when it returns falsy', () => {
    toastError.mockClear();
    const hook = mock(() => false);
    handleActionError(new ActionError('boom', { status: 500 }), { onError: hook });
    expect(hook).toHaveBeenCalledTimes(1);
    expect(toastError).not.toHaveBeenCalled();
  });

  test('chains the default toast when onError returns true', () => {
    toastError.mockClear();
    const hook = mock(() => true);
    handleActionError(new ActionError('boom', { status: 500 }), { onError: hook });
    expect(hook).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledTimes(1);
  });
});

describe('encodeActionInput', () => {
  test('returns empty body + content-type for undefined input', () => {
    const result = encodeActionInput(undefined);
    expect(result.body).toBeUndefined();
    expect(result.contentType).toBeUndefined();
  });

  test('serialises plain objects as application/json', () => {
    const result = encodeActionInput({ foo: 'bar' });
    expect(result.contentType).toBe('application/json');
    expect(typeof result.body).toBe('string');
    expect(JSON.parse(result.body as string)).toEqual({ foo: 'bar' });
  });

  test('passes a Blob through with octet-stream content-type', () => {
    const blob = new Blob(['hello'], { type: 'image/png' });
    const result = encodeActionInput(blob);
    expect(result.contentType).toBe('application/octet-stream');
    expect(result.body).toBe(blob);
  });

  test('wraps a Uint8Array in a fresh ArrayBuffer-backed Blob (no SharedArrayBuffer leak)', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const result = encodeActionInput(bytes);
    expect(result.contentType).toBe('application/octet-stream');
    expect(result.body).toBeInstanceOf(Blob);
    const roundTripped = new Uint8Array(await (result.body as Blob).arrayBuffer());
    expect(roundTripped).toEqual(bytes);
  });

  test('wraps an ArrayBuffer in a Blob', async () => {
    const buf = new Uint8Array([9, 8, 7]).buffer;
    const result = encodeActionInput(buf);
    expect(result.body).toBeInstanceOf(Blob);
    const roundTripped = new Uint8Array(await (result.body as Blob).arrayBuffer());
    expect(roundTripped).toEqual(new Uint8Array([9, 8, 7]));
  });
});
