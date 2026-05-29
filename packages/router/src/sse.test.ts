/**
 * Additional SSE coverage — fills the cleanup, retry-directive, idempotent
 * close, post-close send, and non-Error throw branches that the existing
 * suite in __tests__/sse.test.ts doesn't reach.
 *
 * Per TESTING.md, new tests live colocated with the source rather than
 * under `__tests__/`.
 */

import { describe, expect, test } from 'bun:test';
import { createAsyncSSEStream, createSSEStream } from './sse';

describe('createSSEStream (extra coverage)', () => {
  test('cancel works even when setup returned no cleanup', async () => {
    // Exercises the `cleanup?.()` optional-call branch in cancel() — the
    // existing suite only covers the with-cleanup path.
    const response = createSSEStream(() => undefined);

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Expected readable stream reader');
    }
    await reader.cancel();

    // No cleanup state to assert on — the test passes if cancel didn't
    // throw on the optional-chained invocation.
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
  });

  test('emits the retry directive merged with the first frame', async () => {
    const response = createSSEStream((send, close) => {
      send({ first: true });
      queueMicrotask(close);
    });

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Expected readable stream reader');
    }

    const { value } = await reader.read();
    const chunk = new TextDecoder().decode(value);

    // The retry: 500 directive is glued onto the first chunk so an
    // EventSource consumer (and our SSE tests) see both in a single read().
    expect(chunk).toContain('retry: 500');
    expect(chunk).toContain('data: {"first":true}');

    await reader.cancel();
  });

  test('close() is idempotent when invoked twice', async () => {
    let captured: (() => void) | undefined;

    const response = createSSEStream((send, close) => {
      captured = close;
      send({ hello: true });
      queueMicrotask(() => {
        // First close enqueues nothing extra; the second close hits the
        // try/catch that guards a double `controller.close()`.
        close();
        close();
      });
    });

    const text = await response.text();
    expect(text).toContain('data: {"hello":true}');
    expect(captured).toBeDefined();
  });

  test('subsequent sends after close are swallowed silently', async () => {
    let sendAfterClose: ((data: unknown) => void) | undefined;

    const response = createSSEStream((send, close) => {
      send({ before: true });
      sendAfterClose = send;
      close();
    });

    const text = await response.text();
    expect(text).toContain('data: {"before":true}');

    // The controller is closed — this should hit the catch block in
    // enqueueRaw and not throw.
    expect(() => sendAfterClose?.({ after: true })).not.toThrow();
  });
});

describe('createAsyncSSEStream (extra coverage)', () => {
  test('serialises non-Error throw values via String()', async () => {
    // The handler catches `unknown` and runs `String(error)` to build the
    // SSE error frame — exercise that with a non-Error throw value whose
    // toString() produces a distinguishable string.
    class CustomError {
      toString() {
        return 'custom:non-error-toString';
      }
    }

    const response = createAsyncSSEStream(async () => {
      await Promise.resolve();
      throw new CustomError();
    });

    const text = await response.text();

    expect(text).toContain('"type":"error"');
    expect(text).toContain('custom:non-error-toString');
  });

  test('closes the controller in the finally branch on success', async () => {
    const response = createAsyncSSEStream(async (send) => {
      send({ step: 1 });
    });

    // If finally didn't close the controller, response.text() would hang.
    const text = await response.text();
    expect(text).toContain('data: {"step":1}');
  });

  test('emits the retry prefix on the first chunk before the error frame', async () => {
    const response = createAsyncSSEStream(async () => {
      await Promise.resolve();
      throw new Error('failed');
    });

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Expected readable stream reader');
    }

    const { value } = await reader.read();
    const chunk = new TextDecoder().decode(value);

    expect(chunk).toContain('retry: 500');
    expect(chunk).toContain('failed');

    await reader.cancel();
  });
});
