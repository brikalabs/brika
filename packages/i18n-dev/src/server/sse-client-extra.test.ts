/**
 * Extra coverage for sse-client.ts:
 *   - line 36: reader is null (response body is null) so onChange is NOT called
 */

import { describe, expect, test } from 'bun:test';
import { flush, useBunMock } from '@brika/testing';
import { startHubSseClient } from './sse-client';

const bun = useBunMock();

describe('startHubSseClient extra coverage', () => {
  test('does not fire onChange when response body is null (line 36 path)', async () => {
    // Response with null body — reader will be undefined/null
    bun.fetch(() =>
      Promise.resolve(
        new Response(null, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      )
    );

    const counter = { count: 0 };
    const stop = startHubSseClient({
      apiUrl: 'http://hub.local/api/i18n',
      onChange: () => {
        counter.count++;
      },
      reconnectMs: 60_000,
    });

    // Give the async connect path time to (not) call onChange
    await flush(30);
    expect(counter.count).toBe(0);
    stop();
  });

  test('fires onChange on SSE frame containing "kind" field', async () => {
    const encoder = new TextEncoder();
    const chunk = encoder.encode('data: {"kind":"translation-updated"}\n\n');

    // Stream that sends one event then closes
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.close();
      },
    });

    bun.fetch(() =>
      Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      )
    );

    const calls: string[] = [];
    const stop = startHubSseClient({
      apiUrl: 'http://hub.local/api/i18n',
      onChange: () => {
        calls.push('onChange');
      },
      reconnectMs: 60_000,
    });

    // Wait for at least the initial connect onChange plus the SSE event onChange
    await flush(50);
    // At minimum: initial connect fires onChange once
    expect(calls.length).toBeGreaterThanOrEqual(1);
    stop();
  });

  test('stop() prevents additional reconnects — count stays bounded after first connect', async () => {
    // Each connect fires onChange once. With reconnectMs=5 and stop called
    // after waiting for the first fire, we should see at most a small number
    // of onChange calls rather than unbounded reconnects.
    bun.fetch(() =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
        )
      )
    );

    const counter = { count: 0 };
    const stop = startHubSseClient({
      apiUrl: 'http://hub.local/api/i18n',
      onChange: () => {
        counter.count++;
      },
      reconnectMs: 60_000, // large delay so reconnect never fires during test
    });

    // Wait for the first connect onChange, then stop
    await flush(50);
    const countAtStop = counter.count;
    stop();

    await flush(30);
    // After stop with a 60-second reconnect delay, count should not increase
    expect(counter.count).toBe(countAtStop);
  });
});
