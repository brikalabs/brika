/**
 * Unit tests for `useRegistrySearch` — the debounced search + install
 * state machine. Mocks the hub `fetch` (via `useBunMock`) so the SSE
 * install stream, the plugins list, and the search endpoint all share
 * a single, contained dispatcher. Avoids `mock.module` because Bun's
 * implementation is process-wide and leaks into the api unit tests.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { flush, useBunMock, waitFor } from '@brika/testing';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import React from 'react';
import { CliContext, type CliState, type HubStatus } from '../../../shared/hooks/useCli';
import { type UseRegistrySearch, useRegistrySearch } from './useRegistrySearch';

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

interface SearchHit {
  readonly name: string;
  readonly version: string;
  readonly installed?: boolean;
}

function searchEnvelope(hits: ReadonlyArray<SearchHit>): unknown {
  return {
    plugins: hits.map((h) => ({
      package: { name: h.name, version: h.version },
      installVersion: h.version,
      installed: h.installed ?? false,
      compatible: true,
      downloadCount: 0,
      source: 'registry',
    })),
  };
}

function sseResponse(events: ReadonlyArray<unknown>): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
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

const TEST_DEBOUNCE_MS = 20;

function Probe({
  onResult,
}: Readonly<{ onResult: (r: UseRegistrySearch) => void }>): React.ReactElement {
  const r = useRegistrySearch({ debounceMs: TEST_DEBOUNCE_MS });
  onResult(r);
  return React.createElement(Text, null, '.');
}

function withCli(hub: HubStatus, child: React.ReactElement): React.ReactElement {
  return React.createElement(CliContext.Provider, { value: makeCli(hub) }, child);
}

describe('useRegistrySearch', () => {
  const bun = useBunMock();

  beforeEach(() => {
    bun.fetch(async (input) => {
      const url = urlOf(input);
      if (url.includes('/api/plugins')) {
        return new Response(JSON.stringify({ plugins: [] }), { status: 200 });
      }
      if (url.includes('/api/registry/search')) {
        return new Response(JSON.stringify(searchEnvelope([])), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });
  });

  test('empty query does not call /api/registry/search and yields no results', async () => {
    let searchCalls = 0;
    bun.fetch(async (input) => {
      const url = urlOf(input);
      if (url.includes('/api/registry/search')) {
        searchCalls += 1;
        return new Response(JSON.stringify(searchEnvelope([])), { status: 200 });
      }
      return new Response(JSON.stringify({ plugins: [] }), { status: 200 });
    });
    const latest: { current: UseRegistrySearch | null } = { current: null };
    const { unmount } = render(
      withCli(
        { state: 'running', pid: 1 },
        React.createElement(Probe, {
          onResult: (r) => {
            latest.current = r;
          },
        })
      )
    );
    // Negative assertion: wait long enough that any debounced search would
    // have fired. 3× the test debounce window is comfortably past it.
    await flush(TEST_DEBOUNCE_MS * 3);
    expect(searchCalls).toBe(0);
    expect(latest.current?.results).toEqual([]);
    expect(latest.current?.searching).toBe(false);
    expect(latest.current?.searchError).toBeNull();
    unmount();
  });

  test('debounced query triggers /api/registry/search and populates results', async () => {
    const lastSearchQueryRef: { current: string | null } = { current: null };
    bun.fetch(async (input) => {
      const url = urlOf(input);
      if (url.includes('/api/registry/search')) {
        lastSearchQueryRef.current = new URL(url).searchParams.get('q');
        return new Response(
          JSON.stringify(
            searchEnvelope([
              { name: 'foo', version: '1.0.0' },
              { name: 'bar', version: '2.0.0' },
            ])
          ),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ plugins: [] }), { status: 200 });
    });

    const latest: { current: UseRegistrySearch | null } = { current: null };
    const { unmount } = render(
      withCli(
        { state: 'running', pid: 1 },
        React.createElement(Probe, {
          onResult: (r) => {
            latest.current = r;
          },
        })
      )
    );
    await flush();
    latest.current?.setQuery('http');
    // Debounce fires at ~300ms; poll until the search response lands.
    await waitFor(() => (latest.current?.results.length ?? 0) >= 2, 1000);

    expect(lastSearchQueryRef.current).toBe('http');
    expect(latest.current?.results).toHaveLength(2);
    expect(latest.current?.searching).toBe(false);
    expect(latest.current?.searchError).toBeNull();
    unmount();
  });

  test('captures the search error', async () => {
    bun.fetch(async (input) => {
      const url = urlOf(input);
      if (url.includes('/api/registry/search')) {
        return new Response('boom', { status: 500 });
      }
      return new Response(JSON.stringify({ plugins: [] }), { status: 200 });
    });
    const latest: { current: UseRegistrySearch | null } = { current: null };
    const { unmount } = render(
      withCli(
        { state: 'running', pid: 1 },
        React.createElement(Probe, {
          onResult: (r) => {
            latest.current = r;
          },
        })
      )
    );
    await flush();
    latest.current?.setQuery('x');
    await waitFor(() => latest.current?.searchError !== null, 1000);
    expect(latest.current?.searchError).toMatch(/500/);
    expect(latest.current?.results).toEqual([]);
    unmount();
  });

  test('isInstalled merges hit.installed with the installed-name set', async () => {
    bun.fetch(async (input) => {
      const url = urlOf(input);
      if (url.includes('/api/plugins')) {
        return new Response(
          JSON.stringify({
            plugins: [
              {
                uid: 'local-only',
                name: 'local-only',
                version: '1.0.0',
                status: 'running',
                pid: 1,
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify(searchEnvelope([])), { status: 200 });
    });

    const latest: { current: UseRegistrySearch | null } = { current: null };
    const { unmount } = render(
      withCli(
        { state: 'running', pid: 1 },
        React.createElement(Probe, {
          onResult: (r) => {
            latest.current = r;
          },
        })
      )
    );
    await flush();
    expect(latest).not.toBeNull();
    const hit = (name: string, installed = false) => ({
      name,
      version: '1.0.0',
      installed,
      compatible: true,
      downloadCount: 0,
      source: 'registry',
    });
    expect(latest.current?.isInstalled(hit('local-only'))).toBe(true);
    expect(latest.current?.isInstalled(hit('other', true))).toBe(true);
    expect(latest.current?.isInstalled(hit('fresh'))).toBe(false);
    unmount();
  });

  test('startInstall walks progress events and refreshes installed on complete', async () => {
    let pluginsCalls = 0;
    let installBody: string | null = null;
    bun.fetch(async (input, init) => {
      const url = urlOf(input);
      if (url.includes('/api/plugins')) {
        pluginsCalls += 1;
        return new Response(JSON.stringify({ plugins: [] }), { status: 200 });
      }
      if (url.includes('/api/registry/install')) {
        installBody = typeof init?.body === 'string' ? init.body : '';
        return sseResponse([
          { phase: 'starting' },
          { phase: 'downloading' },
          { phase: 'complete' },
        ]);
      }
      return new Response(JSON.stringify(searchEnvelope([])), { status: 200 });
    });

    const latest: { current: UseRegistrySearch | null } = { current: null };
    const { unmount } = render(
      withCli(
        { state: 'running', pid: 1 },
        React.createElement(Probe, {
          onResult: (r) => {
            latest.current = r;
          },
        })
      )
    );
    await flush();
    expect(pluginsCalls).toBe(1);

    latest.current?.startInstall({
      name: 'cool-plugin',
      version: '2.0.0',
      installed: false,
      compatible: true,
      downloadCount: 0,
      source: 'registry',
    });
    await flush();

    expect(installBody).not.toBeNull();
    expect(JSON.parse(installBody ?? '{}')).toEqual({
      package: 'cool-plugin',
      version: '2.0.0',
    });
    expect(latest.current?.installingName).toBeNull();
    expect(latest.current?.progress?.phase).toBe('complete');
    // refresh() bumps the tick, which triggers another /api/plugins call.
    expect(pluginsCalls).toBe(2);
    unmount();
  });

  test('startInstall surfaces a phase=error event as installError', async () => {
    bun.fetch(async (input) => {
      const url = urlOf(input);
      if (url.includes('/api/plugins')) {
        return new Response(JSON.stringify({ plugins: [] }), { status: 200 });
      }
      if (url.includes('/api/registry/install')) {
        return sseResponse([{ phase: 'starting' }, { phase: 'error', message: 'install denied' }]);
      }
      return new Response(JSON.stringify(searchEnvelope([])), { status: 200 });
    });

    const latest: { current: UseRegistrySearch | null } = { current: null };
    const { unmount } = render(
      withCli(
        { state: 'running', pid: 1 },
        React.createElement(Probe, {
          onResult: (r) => {
            latest.current = r;
          },
        })
      )
    );
    await flush();
    latest.current?.startInstall({
      name: 'bad',
      version: '1.0.0',
      installed: false,
      compatible: true,
      downloadCount: 0,
      source: 'registry',
    });
    await flush();

    expect(latest.current?.installError).toBe('install denied');
    expect(latest.current?.installingName).toBeNull();
    unmount();
  });

  test('startInstall is a no-op when the package is already installed', async () => {
    let installCalls = 0;
    bun.fetch(async (input) => {
      const url = urlOf(input);
      if (url.includes('/api/plugins')) {
        return new Response(JSON.stringify({ plugins: [] }), { status: 200 });
      }
      if (url.includes('/api/registry/install')) {
        installCalls += 1;
        return sseResponse([{ phase: 'complete' }]);
      }
      return new Response(JSON.stringify(searchEnvelope([])), { status: 200 });
    });

    const latest: { current: UseRegistrySearch | null } = { current: null };
    const { unmount } = render(
      withCli(
        { state: 'running', pid: 1 },
        React.createElement(Probe, {
          onResult: (r) => {
            latest.current = r;
          },
        })
      )
    );
    await flush();
    latest.current?.startInstall({
      name: 'already',
      version: '1.0.0',
      installed: true,
      compatible: true,
      downloadCount: 0,
      source: 'registry',
    });
    await flush();
    expect(installCalls).toBe(0);
    expect(latest.current?.installingName).toBeNull();
    unmount();
  });
});
