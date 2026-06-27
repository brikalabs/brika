/**
 * Unit tests for `useLiveTail` — hydrates the ring buffer once and then
 * keeps it in sync with the hub's SSE stream. Mocks the hub `fetch`
 * (via `useBunMock`) so both `/api/logs/recent` and `/api/stream/logs`
 * share one dispatcher.
 */

import { describe, expect, test } from 'bun:test';
import { flush, useBunMock, waitFor } from '@brika/testing';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import React from 'react';
import type { LogEventDto } from '../../../shared/cli/api';
import { type LiveTail, RING_BUFFER_LINES, useLiveTail } from './useLiveTail';

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function makeEvent(over: Partial<LogEventDto> = {}): LogEventDto {
  return {
    ts: 0,
    level: 'info',
    source: 'hub',
    message: 'msg',
    ...over,
  };
}

/** Build an SSE response from a fixed list of events — all events
 *  ship in one body, then the stream closes. */
function sseResponseStatic(events: ReadonlyArray<unknown>): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

/** Build an SSE response with a controllable body stream so the test
 *  can push events on demand and observe abort. Returns the response
 *  plus a `push`/`close` API. */
function controllableSseResponse(signal: AbortSignal | undefined): {
  readonly response: Response;
  readonly push: (event: unknown) => void;
  readonly close: () => void;
} {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      if (signal?.aborted) {
        c.close();
        return;
      }
      signal?.addEventListener(
        'abort',
        () => {
          try {
            c.close();
          } catch {
            // already closed
          }
        },
        { once: true }
      );
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }),
    push: (event) => {
      if (!controller) {
        return;
      }
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      } catch {
        // closed
      }
    },
    close: () => {
      try {
        controller?.close();
      } catch {
        // already closed
      }
    },
  };
}

interface ProbeProps {
  readonly hubRunning: boolean;
  readonly onResult: (r: LiveTail) => void;
}

function Probe({ hubRunning, onResult }: Readonly<ProbeProps>): React.ReactElement {
  const r = useLiveTail(hubRunning);
  onResult(r);
  return React.createElement(Text, null, '.');
}

describe('useLiveTail', () => {
  const bun = useBunMock();

  test('hub not running: returns empty state and does not call fetch', async () => {
    let calls = 0;
    bun.fetch(async () => {
      calls += 1;
      return new Response('{}', { status: 200 });
    });
    const latest: { current: LiveTail | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        hubRunning: false,
        onResult: (r) => {
          latest.current = r;
        },
      })
    );
    await flush();
    expect(calls).toBe(0);
    expect(latest.current?.events).toEqual([]);
    expect(latest.current?.lines).toEqual([]);
    expect(latest.current?.revision).toBe(0);
    expect(latest.current?.streamError).toBeNull();
    unmount();
  });

  test('hub running: hydrates and then merges SSE events', async () => {
    const seed: LogEventDto[] = [
      makeEvent({ ts: 1000, message: 'seed-1' }),
      makeEvent({ ts: 2000, message: 'seed-2' }),
    ];
    bun.fetch(async (input, init) => {
      const url = urlOf(input);
      if (url.includes('/api/logs/recent')) {
        return new Response(JSON.stringify({ events: seed }), { status: 200 });
      }
      if (url.includes('/api/stream/logs')) {
        return sseResponseStatic([
          makeEvent({ ts: 3000, message: 'live-1' }),
          makeEvent({ ts: 4000, message: 'live-2' }),
          makeEvent({ ts: 5000, message: 'live-3' }),
        ]);
      }
      return new Response('not found', { status: 404 });
    });
    const latest: { current: LiveTail | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        hubRunning: true,
        onResult: (r) => {
          latest.current = r;
        },
      })
    );
    await waitFor(() => latest.current?.events.length === 5 && latest.current?.revision === 4);
    expect(latest.current?.events).toHaveLength(5);
    expect(latest.current?.lines).toHaveLength(5);
    // hydrate bumps revision once, then each of 3 SSE events bumps it.
    expect(latest.current?.revision).toBe(4);
    expect(latest.current?.events[0]?.message).toBe('seed-1');
    expect(latest.current?.events[4]?.message).toBe('live-3');
    expect(latest.current?.streamError).toBeNull();
    unmount();
  });

  test('hydrate error: streamError populates, events stays empty', async () => {
    bun.fetch(async (input) => {
      const url = urlOf(input);
      if (url.includes('/api/logs/recent')) {
        return new Response('nope', { status: 502 });
      }
      // Stream never sends anything — leave it pending.
      return sseResponseStatic([]);
    });
    const latest: { current: LiveTail | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        hubRunning: true,
        onResult: (r) => {
          latest.current = r;
        },
      })
    );
    await waitFor(() => /502/.test(latest.current?.streamError ?? ''));
    expect(latest.current?.events).toEqual([]);
    expect(latest.current?.lines).toEqual([]);
    expect(latest.current?.revision).toBe(0);
    expect(latest.current?.streamError).toMatch(/502/);
    unmount();
  });

  test('ring buffer clips at RING_BUFFER_LINES and drops the oldest entries', async () => {
    // 50 hydrated + (RING_BUFFER_LINES + 20) streamed = forces clipping.
    const seed: LogEventDto[] = Array.from({ length: 50 }, (_, i) =>
      makeEvent({ ts: 1 + i, message: `seed-${i}` })
    );
    const liveCount = RING_BUFFER_LINES + 20;
    const live: LogEventDto[] = Array.from({ length: liveCount }, (_, i) =>
      makeEvent({ ts: 100_000 + i, message: `live-${i}` })
    );
    bun.fetch(async (input) => {
      const url = urlOf(input);
      if (url.includes('/api/logs/recent')) {
        return new Response(JSON.stringify({ events: seed }), { status: 200 });
      }
      if (url.includes('/api/stream/logs')) {
        return sseResponseStatic(live);
      }
      return new Response('not found', { status: 404 });
    });
    const latest: { current: LiveTail | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        hubRunning: true,
        onResult: (r) => {
          latest.current = r;
        },
      })
    );
    await waitFor(() => latest.current?.events.length === RING_BUFFER_LINES, 1000);
    expect(latest.current?.events.length).toBe(RING_BUFFER_LINES);
    expect(latest.current?.lines.length).toBe(RING_BUFFER_LINES);
    // Oldest seed entry must be gone — verify by message identity.
    const messages = (latest.current?.events ?? []).map((e) => e.message);
    expect(messages.includes('seed-0')).toBe(false);
    // Newest live entry must be retained.
    expect(messages[messages.length - 1]).toBe(`live-${liveCount - 1}`);
    unmount();
  });

  test('cleanup on unmount: aborts the SSE controller and stops further updates', async () => {
    // Capture the controller(s) handed to /api/stream/logs so we can
    // push AFTER unmount and prove no updates land in state.
    const controls: Array<ReturnType<typeof controllableSseResponse>> = [];
    bun.fetch(async (input, init) => {
      const url = urlOf(input);
      if (url.includes('/api/logs/recent')) {
        return new Response(JSON.stringify({ events: [] }), { status: 200 });
      }
      if (url.includes('/api/stream/logs')) {
        const c = controllableSseResponse(init?.signal ?? undefined);
        controls.push(c);
        return c.response;
      }
      return new Response('not found', { status: 404 });
    });

    let renderCount = 0;
    const latest: { current: LiveTail | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        hubRunning: true,
        onResult: (r) => {
          renderCount += 1;
          latest.current = r;
        },
      })
    );
    await waitFor(() => controls.length === 1);
    // Stream is established and consuming.
    expect(controls).toHaveLength(1);

    // Push one event while mounted — should land.
    controls[0]?.push(makeEvent({ ts: 1, message: 'pre-unmount' }));
    await waitFor(() => latest.current?.events.some((e) => e.message === 'pre-unmount') === true);
    expect(latest.current?.events.some((e) => e.message === 'pre-unmount')).toBe(true);

    const renderCountBeforeUnmount = renderCount;
    unmount();

    // Try pushing after unmount — should be a no-op because the SSE
    // controller was aborted (and the stream's controller closed).
    controls[0]?.push(makeEvent({ ts: 2, message: 'post-unmount' }));
    await flush();

    // No further onResult calls should have landed after unmount —
    // the Probe is gone.
    expect(renderCount).toBe(renderCountBeforeUnmount);
  });
});
