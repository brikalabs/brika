/**
 * Unit tests for `useLogSearch` — the server-backed `/api/logs` search
 * state machine. Mocks the hub `fetch` (via `useBunMock`) rather than
 * the api module itself, mirroring `useRegistrySearch.test.tsx`.
 */

import { describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import React from 'react';
import type { StoredLogEventDto } from '../../../shared/cli/api';
import { type LogSearchControls, useLogSearch } from './useLogSearch';

function flush(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function makeLog(over: Partial<StoredLogEventDto> = {}): StoredLogEventDto {
  return {
    id: 1,
    ts: 0,
    level: 'info',
    source: 'hub',
    message: 'hello',
    ...over,
  };
}

function logsResponse(logs: ReadonlyArray<StoredLogEventDto>): Response {
  return new Response(JSON.stringify({ logs, nextCursor: null }), { status: 200 });
}

interface ProbeProps {
  readonly onResult: (r: LogSearchControls) => void;
}

function Probe({ onResult }: Readonly<ProbeProps>): React.ReactElement {
  const r = useLogSearch();
  onResult(r);
  return React.createElement(Text, null, '.');
}

describe('useLogSearch', () => {
  const bun = useBunMock();

  test('initial state is idle with empty query and results', async () => {
    bun.fetch(async () => logsResponse([]));
    const latest: { current: LogSearchControls | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        onResult: (r) => {
          latest.current = r;
        },
      })
    );
    await flush(20);
    expect(latest.current?.mode).toBe('idle');
    expect(latest.current?.query).toBe('');
    expect(latest.current?.results).toEqual([]);
    expect(latest.current?.currentIdx).toBe(0);
    expect(latest.current?.current).toBeNull();
    expect(latest.current?.error).toBeNull();
    unmount();
  });

  test('enter() flips mode to editing', async () => {
    bun.fetch(async () => logsResponse([]));
    const latest: { current: LogSearchControls | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        onResult: (r) => {
          latest.current = r;
        },
      })
    );
    await flush(20);
    latest.current?.enter();
    await flush(20);
    expect(latest.current?.mode).toBe('editing');
    unmount();
  });

  test('cancel() returns to idle when no query is committed', async () => {
    bun.fetch(async () => logsResponse([]));
    const latest: { current: LogSearchControls | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        onResult: (r) => {
          latest.current = r;
        },
      })
    );
    await flush(20);
    latest.current?.enter();
    await flush(20);
    latest.current?.cancel();
    await flush(20);
    expect(latest.current?.mode).toBe('idle');
    unmount();
  });

  test('cancel() returns to ready when a query is committed', async () => {
    bun.fetch(async () => logsResponse([makeLog({ id: 1, message: 'error 1' })]));
    const latest: { current: LogSearchControls | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        onResult: (r) => {
          latest.current = r;
        },
      })
    );
    await flush(20);
    latest.current?.commit('error');
    await flush(50);
    expect(latest.current?.mode).toBe('ready');
    latest.current?.enter();
    await flush(20);
    latest.current?.cancel();
    await flush(20);
    expect(latest.current?.mode).toBe('ready');
    unmount();
  });

  test('commit("") clears the query and returns to idle without calling fetch', async () => {
    let calls = 0;
    bun.fetch(async () => {
      calls += 1;
      return logsResponse([]);
    });
    const latest: { current: LogSearchControls | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        onResult: (r) => {
          latest.current = r;
        },
      })
    );
    await flush(20);
    latest.current?.commit('');
    await flush(20);
    expect(latest.current?.mode).toBe('idle');
    expect(latest.current?.query).toBe('');
    expect(latest.current?.results).toEqual([]);
    expect(calls).toBe(0);
    unmount();
  });

  test('commit("error") fires a query and populates results on success', async () => {
    const lastSearchRef: { current: string | null } = { current: null };
    bun.fetch(async (input) => {
      const url = urlOf(input);
      lastSearchRef.current = new URL(url).searchParams.get('search');
      return logsResponse([
        makeLog({ id: 1, message: 'error A' }),
        makeLog({ id: 2, message: 'error B' }),
      ]);
    });
    const latest: { current: LogSearchControls | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        onResult: (r) => {
          latest.current = r;
        },
      })
    );
    await flush(20);
    latest.current?.commit('error');
    await flush(50);
    expect(lastSearchRef.current).toBe('error');
    expect(latest.current?.mode).toBe('ready');
    expect(latest.current?.query).toBe('error');
    expect(latest.current?.results).toHaveLength(2);
    expect(latest.current?.currentIdx).toBe(0);
    expect(latest.current?.current?.id).toBe(1);
    expect(latest.current?.error).toBeNull();
    unmount();
  });

  test('commit on API error: mode=error, results=[], error populated', async () => {
    bun.fetch(async () => new Response('boom', { status: 500 }));
    const latest: { current: LogSearchControls | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        onResult: (r) => {
          latest.current = r;
        },
      })
    );
    await flush(20);
    latest.current?.commit('boom');
    await flush(50);
    expect(latest.current?.mode).toBe('error');
    expect(latest.current?.results).toEqual([]);
    expect(latest.current?.error).toMatch(/500/);
    unmount();
  });

  test('next()/prev() wrap around the result list', async () => {
    bun.fetch(async () =>
      logsResponse([
        makeLog({ id: 1, message: 'a' }),
        makeLog({ id: 2, message: 'b' }),
        makeLog({ id: 3, message: 'c' }),
      ])
    );
    const latest: { current: LogSearchControls | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        onResult: (r) => {
          latest.current = r;
        },
      })
    );
    await flush(20);
    latest.current?.commit('x');
    await flush(50);
    expect(latest.current?.currentIdx).toBe(0);

    latest.current?.next();
    await flush(20);
    expect(latest.current?.currentIdx).toBe(1);

    latest.current?.next();
    await flush(20);
    expect(latest.current?.currentIdx).toBe(2);

    // wrap forward
    latest.current?.next();
    await flush(20);
    expect(latest.current?.currentIdx).toBe(0);

    // wrap backward
    latest.current?.prev();
    await flush(20);
    expect(latest.current?.currentIdx).toBe(2);
    unmount();
  });

  test('next()/prev() are no-ops when results are empty', async () => {
    bun.fetch(async () => logsResponse([]));
    const latest: { current: LogSearchControls | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        onResult: (r) => {
          latest.current = r;
        },
      })
    );
    await flush(20);
    latest.current?.next();
    latest.current?.prev();
    await flush(20);
    expect(latest.current?.currentIdx).toBe(0);
    expect(latest.current?.results).toEqual([]);
    unmount();
  });

  test('clear() resets query, results, error and mode', async () => {
    bun.fetch(async () => logsResponse([makeLog({ id: 1, message: 'hit' })]));
    const latest: { current: LogSearchControls | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        onResult: (r) => {
          latest.current = r;
        },
      })
    );
    await flush(20);
    latest.current?.commit('hit');
    await flush(50);
    expect(latest.current?.results).toHaveLength(1);

    latest.current?.clear();
    await flush(20);
    expect(latest.current?.mode).toBe('idle');
    expect(latest.current?.query).toBe('');
    expect(latest.current?.results).toEqual([]);
    expect(latest.current?.currentIdx).toBe(0);
    expect(latest.current?.error).toBeNull();
    unmount();
  });

  test('two rapid commits — first request is aborted, only the second result is kept', async () => {
    let callIndex = 0;
    const seenSignals: AbortSignal[] = [];
    bun.fetch(async (input, init) => {
      const url = urlOf(input);
      const search = new URL(url).searchParams.get('search') ?? '';
      const signal = init?.signal;
      if (signal instanceof AbortSignal) {
        seenSignals.push(signal);
      }
      callIndex += 1;
      const myCall = callIndex;
      if (myCall === 1) {
        // First call: stall long enough for the second commit to fire
        // and abort us. Resolve only once the signal aborts so the
        // generator below sees the abort and bails out.
        await new Promise<void>((resolve) => {
          if (signal?.aborted) {
            resolve();
            return;
          }
          signal?.addEventListener('abort', () => resolve(), { once: true });
        });
        if (signal?.aborted) {
          throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        }
      }
      return logsResponse([makeLog({ id: myCall, message: `result ${search}` })]);
    });

    const latest: { current: LogSearchControls | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        onResult: (r) => {
          latest.current = r;
        },
      })
    );
    await flush(20);
    latest.current?.commit('first');
    await flush(20);
    latest.current?.commit('second');
    await flush(80);

    expect(seenSignals).toHaveLength(2);
    expect(seenSignals[0]?.aborted).toBe(true);
    expect(seenSignals[1]?.aborted).toBe(false);
    expect(latest.current?.query).toBe('second');
    expect(latest.current?.mode).toBe('ready');
    expect(latest.current?.results).toHaveLength(1);
    expect(latest.current?.results[0]?.message).toBe('result second');
    unmount();
  });
});
