/**
 * Unit tests for `useHubResource` — the generic fetcher used by every
 * hub-backed list view in the TUI. Verifies the running-only gating,
 * one-shot fetch on mount, manual refresh, and error capture.
 */

import { describe, expect, mock, test } from 'bun:test';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import React from 'react';
import { flush, waitFor } from '../../_test-helpers';
import { CliContext, type CliState, type HubStatus } from './useCli';
import { type HubResource, useHubResource } from './useHubResource';

function makeCli(hub: HubStatus): CliState {
  return {
    workspace: '/ws',
    version: '0.0.0',
    hub,
    mood: 'idle',
    statusText: '',
    activityEmote: null,
    startHub: async () => undefined,
    stopHub: async () => undefined,
    restartHub: async () => undefined,
    openUi: async () => undefined,
  };
}

interface ProbeProps<T> {
  readonly fetcher: () => Promise<T>;
  readonly onResult: (r: HubResource<T>) => void;
}

function Probe<T>({ fetcher, onResult }: Readonly<ProbeProps<T>>): React.ReactElement {
  const r = useHubResource<T>(fetcher);
  onResult(r);
  return React.createElement(Text, null, '.');
}

function withCli(hub: HubStatus, child: React.ReactElement): React.ReactElement {
  return React.createElement(CliContext.Provider, { value: makeCli(hub) }, child);
}

describe('useHubResource', () => {
  test('does not call the fetcher while the hub is not running', async () => {
    const fetcher = mock(async () => ['x']);
    const latest: { current: HubResource<string[]> | null } = { current: null };
    const { unmount } = render(
      withCli(
        { state: 'stopped' },
        React.createElement(Probe<string[]>, {
          fetcher,
          onResult: (r) => {
            latest.current = r;
          },
        })
      )
    );
    await flush();
    expect(fetcher).not.toHaveBeenCalled();
    expect(latest.current?.data).toBeNull();
    expect(latest.current?.error).toBeNull();
    expect(latest.current?.loading).toBe(false);
    unmount();
  });

  test('fetches once and populates data when hub is running', async () => {
    const fetcher = mock(async () => [{ name: 'a' }, { name: 'b' }]);
    const latest: { current: HubResource<Array<{ name: string }>> | null } = { current: null };
    const { unmount } = render(
      withCli(
        { state: 'running', pid: 1 },
        React.createElement(Probe<Array<{ name: string }>>, {
          fetcher,
          onResult: (r) => {
            latest.current = r;
          },
        })
      )
    );
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(latest.current?.data).toEqual([{ name: 'a' }, { name: 'b' }]);
    expect(latest.current?.error).toBeNull();
    expect(latest.current?.loading).toBe(false);
    unmount();
  });

  test('captures errors thrown by the fetcher', async () => {
    const fetcher = mock(async (): Promise<string[]> => {
      throw new Error('hub down');
    });
    const latest: { current: HubResource<string[]> | null } = { current: null };
    const { unmount } = render(
      withCli(
        { state: 'running', pid: 42 },
        React.createElement(Probe<string[]>, {
          fetcher,
          onResult: (r) => {
            latest.current = r;
          },
        })
      )
    );
    await flush();
    expect(latest.current?.error).toBe('hub down');
    expect(latest.current?.data).toBeNull();
    expect(latest.current?.loading).toBe(false);
    unmount();
  });

  test('refresh() re-invokes the fetcher and updates data', async () => {
    let calls = 0;
    const fetcher = mock(async () => {
      calls += 1;
      return [`v${calls}`];
    });
    const latest: { current: HubResource<string[]> | null } = { current: null };
    const { unmount } = render(
      withCli(
        { state: 'running', pid: 1 },
        React.createElement(Probe<string[]>, {
          fetcher,
          onResult: (r) => {
            latest.current = r;
          },
        })
      )
    );
    await waitFor(() => latest.current?.data?.[0] === 'v1');
    expect(latest.current?.data).toEqual(['v1']);

    latest.current?.refresh();
    await waitFor(() => latest.current?.data?.[0] === 'v2');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(latest.current?.data).toEqual(['v2']);
    unmount();
  });
});
