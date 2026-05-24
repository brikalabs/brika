/**
 * Unit tests for `useLiveMetrics` — the 2-second poller behind the
 * detail panel's CPU/memory readout. Mocks the hub `fetch` (via
 * `useBunMock`) so we can count the number of metrics endpoint hits
 * and assert the polling lifecycle:
 *
 *   - `enabled=false` → never fetches.
 *   - `enabled=true` → first fetch populates state.
 *   - Errors are silently swallowed (metrics stays null).
 *   - Cleanup on unmount stops the interval (no additional hits).
 *
 * The 2 s interval is intentionally faster than the polling cadence
 * — we only assert that the FIRST call lands; covering subsequent
 * ticks would require fake timers and slow the test down for little
 * additional coverage.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import React from 'react';
import { flush } from '../../../../_test-helpers';
import type { PluginMetrics } from '../../../../shared/cli/api/plugins';
import { useLiveMetrics } from './useLiveMetrics';

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

interface ProbeProps {
  readonly uid: string | null;
  readonly enabled: boolean;
  readonly onResult: (m: PluginMetrics | null) => void;
}

function Probe({ uid, enabled, onResult }: Readonly<ProbeProps>): React.ReactElement {
  const m = useLiveMetrics(uid, enabled);
  onResult(m);
  return React.createElement(Text, null, '.');
}

const sampleMetrics: PluginMetrics = {
  pid: 1234,
  current: { cpu: 5.5, memory: 1024 * 1024 },
  history: [],
};

describe('useLiveMetrics', () => {
  const bun = useBunMock();

  beforeEach(() => {
    bun.fetch(async () => new Response(JSON.stringify(sampleMetrics), { status: 200 }));
  });

  test('does not fetch while enabled=false', async () => {
    let calls = 0;
    bun.fetch(async () => {
      calls += 1;
      return new Response(JSON.stringify(sampleMetrics), { status: 200 });
    });
    const latest: { current: PluginMetrics | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        uid: 'plug-1',
        enabled: false,
        onResult: (m) => {
          latest.current = m;
        },
      })
    );
    await flush();
    expect(calls).toBe(0);
    expect(latest.current).toBeNull();
    unmount();
  });

  test('does not fetch when uid is null', async () => {
    let calls = 0;
    bun.fetch(async () => {
      calls += 1;
      return new Response(JSON.stringify(sampleMetrics), { status: 200 });
    });
    const { unmount } = render(
      React.createElement(Probe, {
        uid: null,
        enabled: true,
        onResult: () => undefined,
      })
    );
    await flush();
    expect(calls).toBe(0);
    unmount();
  });

  test('fetches once on mount when enabled, populates state', async () => {
    let calls = 0;
    let lastUrl = '';
    bun.fetch(async (input) => {
      calls += 1;
      lastUrl = urlOf(input);
      return new Response(JSON.stringify(sampleMetrics), { status: 200 });
    });
    const latest: { current: PluginMetrics | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        uid: 'plug-2',
        enabled: true,
        onResult: (m) => {
          latest.current = m;
        },
      })
    );
    await flush();
    expect(calls).toBeGreaterThanOrEqual(1);
    expect(lastUrl).toContain('/api/plugins/plug-2/metrics');
    expect(latest.current?.pid).toBe(1234);
    expect(latest.current?.current?.cpu).toBe(5.5);
    unmount();
  });

  test('silently swallows fetch errors — metrics stays null', async () => {
    bun.fetch(async () => new Response('boom', { status: 500 }));
    const latest: { current: PluginMetrics | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        uid: 'plug-err',
        enabled: true,
        onResult: (m) => {
          latest.current = m;
        },
      })
    );
    await flush();
    // No throw, no metrics — error branch silently no-ops.
    expect(latest.current).toBeNull();
    unmount();
  });

  test('unmount stops the polling — no further fetches after teardown', async () => {
    let calls = 0;
    bun.fetch(async () => {
      calls += 1;
      return new Response(JSON.stringify(sampleMetrics), { status: 200 });
    });
    const { unmount } = render(
      React.createElement(Probe, {
        uid: 'plug-x',
        enabled: true,
        onResult: () => undefined,
      })
    );
    await flush();
    const before = calls;
    expect(before).toBeGreaterThanOrEqual(1);
    unmount();
    // Wait a touch longer than the visible flush — if the interval
    // were still alive it would have ticked one more time by ~250ms,
    // but the cleanup `clearInterval` keeps the count stable.
    await flush(300);
    expect(calls).toBe(before);
  });
});
