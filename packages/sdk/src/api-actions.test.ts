/**
 * Tests for SDK actions API (defineAction runtime behavior)
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';

const mockRegisterAction = mock((_id: string, _handler: (...args: unknown[]) => unknown) => {});

mock.module('./context', () => ({
  getContext: () => ({
    registerAction: mockRegisterAction,
  }),
}));

const {
  BINARY_RESPONSE_TAG,
  STREAM_FILE_TAG,
  STREAM_WRITE_TAG,
  binaryResponse,
  defineAction,
  isBinaryResponse,
  isStreamFileResponse,
  isStreamWriteResponse,
  streamFile,
  streamWrite,
} = await import('./api/actions');

describe('defineAction', () => {
  beforeEach(() => {
    mockRegisterAction.mockClear();
  });

  // ── Build-injected ID (string first arg) ──────────────────────────────────

  test('accepts build-injected string ID as first argument', () => {
    const handler = async () => ({ ok: true });
    const ref = defineAction('abc123', handler);

    expect(ref.__actionId).toBe('abc123');
  });

  test('registers handler with injected ID', () => {
    const handler = async () => 'result';
    defineAction('my-action-id', handler);

    expect(mockRegisterAction).toHaveBeenCalledTimes(1);
    const call = mockRegisterAction.mock.calls[0];
    if (!call) {
      throw new Error('Expected mock to have been called');
    }
    const [id, registeredHandler] = call;
    expect(id).toBe('my-action-id');
    expect(typeof registeredHandler).toBe('function');
  });

  // ── Deferred: handler without ID (finalized later) ──────────────────────

  test('creates deferred ref when no string ID is provided', () => {
    const ref = defineAction(async function myAction() {
      return 42;
    });

    // Deferred ref has empty ID until __finalizeActions is called
    expect(ref.__actionId).toBe('');
    expect(mockRegisterAction).not.toHaveBeenCalled();
  });

  test('does not throw for anonymous handlers (deferred)', () => {
    expect(() => {
      defineAction(async () => 'no-name');
    }).not.toThrow();
  });

  test('throws TypeError when string ID provided but no handler argument given', () => {
    expect(() => {
      // Bypassing TypeScript to test the runtime guard (lines 83-86).
      (defineAction as (id: string) => unknown)('no-handler-id');
    }).toThrow(TypeError);
  });

  test('TypeError message includes the action id', () => {
    let msg = '';
    try {
      (defineAction as (id: string) => unknown)('my-broken-action');
    } catch (err) {
      if (err instanceof TypeError) {
        msg = err.message;
      }
    }
    expect(msg).toContain('my-broken-action');
  });

  // ── __finalizeActions ─────────────────────────────────────────────────────

  test('__finalizeActions assigns IDs and registers handlers', async () => {
    const { __finalizeActions } = await import('./api/actions');
    const ref = defineAction(async () => 'result');

    __finalizeActions({ myExport: 'precomputed-id-123' }, { myExport: ref });

    expect(ref.__actionId).toBe('precomputed-id-123');
    expect(mockRegisterAction).toHaveBeenCalledTimes(1);
  });

  test('__finalizeActions skips non-action exports', async () => {
    const { __finalizeActions } = await import('./api/actions');

    __finalizeActions(
      { notAnAction: 'id1', alsoNot: 'id2', nullValue: 'id3' },
      {
        notAnAction: 'just a string',
        alsoNot: 42,
        nullValue: null,
      }
    );

    expect(mockRegisterAction).not.toHaveBeenCalled();
  });

  // ── ActionRef shape ─────────────────────────────────────────────────────────

  test('returns ActionRef with __actionId string', () => {
    const ref = defineAction('test-id', async () => null);
    expect(typeof ref.__actionId).toBe('string');
    expect(ref.__actionId).toBe('test-id');
  });

  test('different IDs produce different refs', () => {
    const ref1 = defineAction('id-1', async () => 1);
    const ref2 = defineAction('id-2', async () => 2);
    const ref3 = defineAction('id-3', async () => 3);

    expect(ref1.__actionId).not.toBe(ref2.__actionId);
    expect(ref2.__actionId).not.toBe(ref3.__actionId);
    expect(ref1.__actionId).not.toBe(ref3.__actionId);
  });
});

describe('binaryResponse', () => {
  test('produces a tagged envelope carrying bytes and contentType', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const result = binaryResponse(bytes, 'image/png');
    expect(isBinaryResponse(result)).toBe(true);
    // Cast through unknown so we can inspect the runtime envelope —
    // the public return type lies as Blob for end-to-end safety.
    const envelope = result as unknown as Record<string, unknown>;
    expect(envelope[BINARY_RESPONSE_TAG]).toBe(true);
    expect(envelope.bytes).toBe(bytes);
    expect(envelope.contentType).toBe('image/png');
  });

  test('defaults contentType to application/octet-stream', () => {
    const result = binaryResponse(new Uint8Array());
    const envelope = result as unknown as Record<string, unknown>;
    expect(envelope.contentType).toBe('application/octet-stream');
  });
});

describe('streamFile', () => {
  test('produces a tagged envelope carrying virtualPath and contentType', () => {
    const result = streamFile('/data/foo.png', 'image/png');
    expect(isStreamFileResponse(result)).toBe(true);
    const envelope = result as unknown as Record<string, unknown>;
    expect(envelope[STREAM_FILE_TAG]).toBe(true);
    expect(envelope.virtualPath).toBe('/data/foo.png');
    expect(envelope.contentType).toBe('image/png');
  });

  test('omits contentType when none provided', () => {
    const result = streamFile('/data/bin');
    const envelope = result as unknown as Record<string, unknown>;
    expect(envelope.contentType).toBeUndefined();
  });

  test('isStreamFileResponse rejects unrelated values', () => {
    expect(isStreamFileResponse(null)).toBe(false);
    expect(isStreamFileResponse('hello')).toBe(false);
    expect(isStreamFileResponse({ [STREAM_FILE_TAG]: false })).toBe(false);
    expect(isStreamFileResponse({ virtualPath: '/x' })).toBe(false);
    expect(isStreamFileResponse(binaryResponse(new Uint8Array()))).toBe(false);
  });

  test('isBinaryResponse rejects stream envelopes', () => {
    expect(isBinaryResponse(streamFile('/x'))).toBe(false);
  });
});

describe('streamWrite', () => {
  test('produces a tagged envelope carrying virtualPath', () => {
    const result = streamWrite('/data/upload.dmg');
    expect(isStreamWriteResponse(result)).toBe(true);
    const envelope = result as unknown as Record<string, unknown>;
    expect(envelope[STREAM_WRITE_TAG]).toBe(true);
    expect(envelope.virtualPath).toBe('/data/upload.dmg');
  });

  test('isStreamWriteResponse rejects unrelated values and other envelopes', () => {
    expect(isStreamWriteResponse(null)).toBe(false);
    expect(isStreamWriteResponse('hello')).toBe(false);
    expect(isStreamWriteResponse({ [STREAM_WRITE_TAG]: false })).toBe(false);
    expect(isStreamWriteResponse({ virtualPath: '/x' })).toBe(false);
    expect(isStreamWriteResponse(streamFile('/x'))).toBe(false);
    expect(isStreamWriteResponse(binaryResponse(new Uint8Array()))).toBe(false);
  });

  test('the discriminators do not cross-match', () => {
    expect(isStreamFileResponse(streamWrite('/x'))).toBe(false);
    expect(isBinaryResponse(streamWrite('/x'))).toBe(false);
  });
});
