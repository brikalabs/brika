/**
 * Unit tests for `useReadme` — the generic README fetcher used by the
 * Installed and Registry detail panels.
 */

import { describe, expect, mock, test } from 'bun:test';
import { flush, waitFor } from '@brika/testing';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import React from 'react';
import { type UseReadme, useReadme } from './useReadme';

// 250ms is the project-wide ink-testing flush ceiling — generous enough
// to absorb CI under parallel test pressure (see List.test.tsx).
interface ProbeProps {
  readonly fetcher: (key: string) => Promise<string>;
  readonly k: string;
  readonly onResult: (r: UseReadme) => void;
}

function Probe({ fetcher, k, onResult }: Readonly<ProbeProps>): React.ReactElement {
  const result = useReadme(fetcher, k);
  onResult(result);
  return React.createElement(Text, null, '.');
}

describe('useReadme', () => {
  test('reports loading=true with no text/error while the fetcher is pending', async () => {
    const pendingResolveRef: { current: ((value: string) => void) | null } = { current: null };
    const fetcher = mock((_key: string): Promise<string> => {
      return new Promise<string>((resolve) => {
        pendingResolveRef.current = resolve;
      });
    });
    const latest: { current: UseReadme | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        fetcher,
        k: 'a',
        onResult: (r) => {
          latest.current = r;
        },
      })
    );
    // One flush lets the effect run (which sets loading=true) but the
    // promise never resolves, so we observe the in-flight state.
    await flush();
    expect(latest).not.toBeNull();
    expect(latest.current?.loading).toBe(true);
    expect(latest.current?.text).toBeNull();
    expect(latest.current?.error).toBeNull();
    pendingResolveRef.current?.('done');
    unmount();
  });

  test('populates text and clears loading after the fetcher resolves', async () => {
    const fetcher = mock(async (_key: string) => '# Hello world');
    const latest: { current: UseReadme | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        fetcher,
        k: 'plugin-a',
        onResult: (r) => {
          latest.current = r;
        },
      })
    );
    await flush();
    expect(latest).not.toBeNull();
    expect(latest.current?.text).toBe('# Hello world');
    expect(latest.current?.loading).toBe(false);
    expect(latest.current?.error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    unmount();
  });

  test('populates error and clears loading after the fetcher rejects', async () => {
    const fetcher = mock(async (_key: string): Promise<string> => {
      throw new Error('network down');
    });
    const latest: { current: UseReadme | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        fetcher,
        k: 'plugin-a',
        onResult: (r) => {
          latest.current = r;
        },
      })
    );
    await waitFor(() => latest.current?.error === 'network down');
    expect(latest.current?.error).toBe('network down');
    expect(latest.current?.text).toBeNull();
    expect(latest.current?.loading).toBe(false);
    unmount();
  });

  test('re-fetches when the key changes; stale result is discarded', async () => {
    const pending = new Map<string, (value: string) => void>();
    const fetcher = mock((key: string): Promise<string> => {
      return new Promise<string>((resolve) => {
        pending.set(key, resolve);
      });
    });
    const latest: { current: UseReadme | null } = { current: null };
    const onResult = (r: UseReadme): void => {
      latest.current = r;
    };
    const { rerender, unmount } = render(
      React.createElement(Probe, { fetcher, k: 'first', onResult })
    );
    await waitFor(() => fetcher.mock.calls.length >= 1);
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Switch keys before the first promise resolves.
    rerender(React.createElement(Probe, { fetcher, k: 'second', onResult }));
    await waitFor(() => fetcher.mock.calls.length >= 2);
    expect(fetcher).toHaveBeenCalledTimes(2);

    // Resolve the stale (first) call last — its value must be ignored
    // because the cleanup flagged it as cancelled.
    pending.get('second')?.('SECOND_README');
    pending.get('first')?.('FIRST_README');
    await waitFor(() => latest.current?.text === 'SECOND_README');

    expect(latest.current?.text).toBe('SECOND_README');
    expect(latest.current?.loading).toBe(false);
    unmount();
  });

  test('still calls the fetcher when the key is the empty string', async () => {
    const fetcher = mock(async (key: string) => `key=${key}`);
    const latest: { current: UseReadme | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        fetcher,
        k: '',
        onResult: (r) => {
          latest.current = r;
        },
      })
    );
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('');
    expect(latest.current?.text).toBe('key=');
    unmount();
  });
});
