import { describe, expect, test } from 'bun:test';
import { flush, useBunMock, waitFor } from '@brika/testing';
import { startHubSseClient } from './sse-client';

const bun = useBunMock();

function sseResponse(body: ReadableStream<Uint8Array>): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function emptyStream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}

describe('startHubSseClient', () => {
  test('fires onChange once when the stream successfully connects', async () => {
    bun.fetch(() => Promise.resolve(sseResponse(emptyStream())));
    const counter = { count: 0 };

    const stop = startHubSseClient({
      apiUrl: 'http://hub.local/api/i18n',
      onChange: () => {
        counter.count++;
      },
      reconnectMs: 60_000,
    });

    await waitFor(() => counter.count >= 1);
    expect(counter.count).toBe(1);
    stop();
  });

  test('does not fire onChange when the initial connect rejects', async () => {
    bun.fetch(() => Promise.reject(new Error('ECONNREFUSED')));
    const counter = { count: 0 };

    const stop = startHubSseClient({
      apiUrl: 'http://hub.local/api/i18n',
      onChange: () => {
        counter.count++;
      },
      reconnectMs: 60_000,
    });

    // Negative assertion: give the connect path a few ticks to (not) fire.
    await flush(20);
    expect(counter.count).toBe(0);
    stop();
  });

  test('fires onChange again on every successful reconnect', async () => {
    // Two connect attempts: first stream closes immediately, second also closes.
    // The reconnect loop should call onChange once per successful open.
    bun.fetch(() => Promise.resolve(sseResponse(emptyStream())));
    const counter = { count: 0 };

    const stop = startHubSseClient({
      apiUrl: 'http://hub.local/api/i18n',
      onChange: () => {
        counter.count++;
      },
      reconnectMs: 20,
    });

    await waitFor(() => counter.count >= 2);
    expect(counter.count).toBeGreaterThanOrEqual(2);
    stop();
  });
});
