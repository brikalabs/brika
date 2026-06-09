/**
 * Tests for SSE (Server-Sent Events) utilities — base coverage plus the
 * extra branches (`cleanup?.()` short-circuit, retry-directive merge,
 * idempotent close, post-close send swallowing, non-Error throw via
 * `String()`, finally-close on success) that the original suite missed.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'bun:test';
import { createAsyncSSEStream, createSSEStream } from './sse';

describe('SSE', () => {
  describe('createSSEStream', () => {
    test('returns a Response with correct headers', () => {
      const response = createSSEStream(() => undefined);

      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
      expect(response.headers.get('Connection')).toBe('keep-alive');
    });

    test('sends data correctly', async () => {
      const response = createSSEStream((send, close) => {
        send({
          message: 'hello',
        });
        send({
          message: 'world',
        });
        queueMicrotask(close);
      });

      const text = await response.text();

      expect(text).toContain('data: {"message":"hello"}');
      expect(text).toContain('data: {"message":"world"}');
    });

    test('sends data with event name', async () => {
      const response = createSSEStream((send, close) => {
        send(
          {
            value: 42,
          },
          'custom-event'
        );
        queueMicrotask(close);
      });

      const text = await response.text();

      expect(text).toContain('event: custom-event');
      expect(text).toContain('data: {"value":42}');
    });

    test('calls cleanup on stream cancel', async () => {
      let cleaned = false;

      const response = createSSEStream(() => {
        return () => {
          cleaned = true;
        };
      });

      // Cancel the stream
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Expected readable stream reader');
      }
      await reader.cancel();

      expect(cleaned).toBe(true);
    });
  });

  describe('createAsyncSSEStream', () => {
    test('returns a Response with correct headers', () => {
      const response = createAsyncSSEStream(async () => undefined);

      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
    });

    test('sends async data correctly', async () => {
      const response = createAsyncSSEStream(async (send) => {
        send({
          type: 'start',
        });
        await Promise.resolve();
        send({
          type: 'end',
        });
      });

      const text = await response.text();

      expect(text).toContain('data: {"type":"start"}');
      expect(text).toContain('data: {"type":"end"}');
    });

    test('sends event name with data', async () => {
      const response = createAsyncSSEStream(async (send) => {
        await Promise.resolve();
        send(
          {
            data: 'test',
          },
          'progress'
        );
      });

      const text = await response.text();

      expect(text).toContain('event: progress');
      expect(text).toContain('data: {"data":"test"}');
    });

    test('handles errors gracefully', async () => {
      const response = createAsyncSSEStream(async () => {
        await Promise.resolve();
        throw new Error('Test error');
      });

      const text = await response.text();

      expect(text).toContain('error');
      expect(text).toContain('Test error');
    });
  });
});

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

describe('createSSEStream (heartbeat)', () => {
  test('setInterval callback enqueues the heartbeat comment frame', async () => {
    // Intercept setInterval to capture the heartbeat callback so we can fire
    // it synchronously without waiting 30 s or using fake timers (which
    // deadlock against the ReadableStream pull machinery in Bun 1.3.x).
    let capturedCallback: (() => void) | undefined;
    const origSetInterval = globalThis.setInterval;
    const origClearInterval = globalThis.clearInterval;
    let fakeTimer: ReturnType<typeof setInterval> | undefined;

    globalThis.setInterval = ((cb: () => void, _delay: number) => {
      capturedCallback = cb;
      fakeTimer = origSetInterval(() => undefined, 9_999_999);
      return fakeTimer;
    }) as typeof setInterval;

    globalThis.clearInterval = ((id: ReturnType<typeof setInterval> | undefined) => {
      if (id === fakeTimer) {
        origClearInterval(fakeTimer);
      }
    }) as typeof clearInterval;

    try {
      let capturedClose: (() => void) | undefined;
      const response = createSSEStream((send, close) => {
        capturedClose = close;
        // Send one message so the stream has data to read (the retry prefix
        // is merged with the first send, so without a send the first read()
        // would block forever waiting for an enqueue).
        send({ ping: true });
      });

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Expected readable stream reader');
      }

      // Read the first chunk (retry: prefix + first send).
      const firstChunk = await reader.read();
      const firstText = new TextDecoder().decode(firstChunk.value);
      expect(firstText).toContain('retry: 500');
      expect(firstText).toContain('"ping":true');

      // Manually fire the heartbeat callback (simulating 30 s elapsing).
      if (!capturedCallback) {
        throw new Error('setInterval callback was not captured');
      }
      capturedCallback();

      // The heartbeat chunk is now enqueued.
      const heartbeatChunk = await reader.read();
      const heartbeatText = new TextDecoder().decode(heartbeatChunk.value);
      expect(heartbeatText).toBe(': heartbeat\n\n');

      capturedClose?.();
      await reader.cancel();
    } finally {
      globalThis.setInterval = origSetInterval;
      globalThis.clearInterval = origClearInterval;
    }
  });

  test('clearInterval is called when close() is invoked', async () => {
    let clearIntervalCallCount = 0;
    const origSetInterval = globalThis.setInterval;
    const origClearInterval = globalThis.clearInterval;

    globalThis.setInterval = ((_cb: () => void, _delay: number) => {
      return origSetInterval(() => undefined, 9_999_999);
    }) as typeof setInterval;

    globalThis.clearInterval = ((id: ReturnType<typeof setInterval> | undefined) => {
      clearIntervalCallCount++;
      origClearInterval(id);
    }) as typeof clearInterval;

    try {
      let capturedClose: (() => void) | undefined;
      const response = createSSEStream((send, close) => {
        capturedClose = close;
        send({ ping: true });
      });

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Expected readable stream reader');
      }

      await reader.read();

      capturedClose?.();

      // clearInterval(heartbeat) runs inside close().
      expect(clearIntervalCallCount).toBeGreaterThanOrEqual(1);

      await reader.cancel();
    } finally {
      globalThis.setInterval = origSetInterval;
      globalThis.clearInterval = origClearInterval;
    }
  });

  test('cancel() calls clearInterval and cleanup', async () => {
    let clearIntervalCallCount = 0;
    const origSetInterval = globalThis.setInterval;
    const origClearInterval = globalThis.clearInterval;

    globalThis.setInterval = ((_cb: () => void, _delay: number) => {
      return origSetInterval(() => undefined, 9_999_999);
    }) as typeof setInterval;

    globalThis.clearInterval = ((id: ReturnType<typeof setInterval> | undefined) => {
      clearIntervalCallCount++;
      origClearInterval(id);
    }) as typeof clearInterval;

    let cleaned = false;

    try {
      const response = createSSEStream((send) => {
        send({ ping: true });
        return () => {
          cleaned = true;
        };
      });

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Expected readable stream reader');
      }

      await reader.read();

      await reader.cancel();

      expect(clearIntervalCallCount).toBeGreaterThanOrEqual(1);
      expect(cleaned).toBe(true);
    } finally {
      globalThis.setInterval = origSetInterval;
      globalThis.clearInterval = origClearInterval;
    }
  });
});
