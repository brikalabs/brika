/**
 * Unit tests for `useUpdates` — the state machine backing the Updates
 * section. Mocks the underlying hub `fetch` (via `useBunMock`) rather
 * than the api module itself, because Bun's `mock.module` is process-
 * wide and bleeds into the api unit tests that import the real module.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import React from 'react';
import { flush } from '../../_test-helpers';
import type { UpdateInfoDto } from '../../shared/cli/api/updates';
import { CliContext, type CliState, type HubStatus } from '../../shared/hooks/useCli';
import { type UseUpdates, useUpdates } from './useUpdates';

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

function makeInfo(over: Partial<UpdateInfoDto> = {}): UpdateInfoDto {
  return {
    currentVersion: '1.0.0',
    latestVersion: '1.0.0',
    updateAvailable: false,
    devBuild: false,
    channelMismatch: false,
    releaseUrl: '',
    releaseNotes: '',
    publishedAt: '',
    releaseCommit: '',
    currentCommit: '',
    assetName: null,
    assetSize: null,
    channel: 'stable',
    lastCheckedAt: null,
    ...over,
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

function Probe({ onResult }: Readonly<{ onResult: (r: UseUpdates) => void }>): React.ReactElement {
  const r = useUpdates();
  onResult(r);
  return React.createElement(Text, null, '.');
}

function withCli(hub: HubStatus, child: React.ReactElement): React.ReactElement {
  return React.createElement(CliContext.Provider, { value: makeCli(hub) }, child);
}

describe('useUpdates', () => {
  const bun = useBunMock();

  beforeEach(() => {
    // sensible default — individual tests reconfigure as needed
    bun.fetch(async (input) => {
      const url = urlOf(input);
      if (url.includes('/api/system/update/apply')) {
        return sseResponse([{ phase: 'complete' }]);
      }
      if (url.includes('/api/system/update')) {
        return new Response(JSON.stringify(makeInfo()), { status: 200 });
      }
      if (url.includes('/api/settings/update-channel')) {
        return new Response(JSON.stringify({ channel: 'stable' }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });
  });

  test('skips the initial check when the hub is not running', async () => {
    let calls = 0;
    bun.fetch(async () => {
      calls += 1;
      return new Response('{}', { status: 200 });
    });
    const latest: { current: UseUpdates | null } = { current: null };
    const { unmount } = render(
      withCli(
        { state: 'stopped' },
        React.createElement(Probe, {
          onResult: (r) => {
            latest.current = r;
          },
        })
      )
    );
    await flush();
    expect(calls).toBe(0);
    expect(latest.current?.info).toBeNull();
    expect(latest.current?.channel).toBeNull();
    unmount();
  });

  test('auto-checks on mount when the hub is running', async () => {
    bun.fetch(async (input) => {
      const url = urlOf(input);
      if (url.includes('/api/settings/update-channel')) {
        return new Response(JSON.stringify({ channel: 'canary' }), { status: 200 });
      }
      return new Response(
        JSON.stringify(makeInfo({ latestVersion: '1.2.0', updateAvailable: true })),
        { status: 200 }
      );
    });

    const latest: { current: UseUpdates | null } = { current: null };
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
    expect(latest.current?.info?.latestVersion).toBe('1.2.0');
    expect(latest.current?.channel).toBe('canary');
    expect(latest.current?.checking).toBe(false);
    expect(latest.current?.error).toBeNull();
    unmount();
  });

  test('populates error when the check fails', async () => {
    bun.fetch(async (input) => {
      const url = urlOf(input);
      if (url.includes('/api/settings/update-channel')) {
        return new Response(JSON.stringify({ channel: 'stable' }), { status: 200 });
      }
      return new Response('nope', { status: 502 });
    });
    const latest: { current: UseUpdates | null } = { current: null };
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
    expect(latest.current?.error).toMatch(/502/);
    expect(latest.current?.info).toBeNull();
    unmount();
  });

  test('cycleChannel PUTs the new channel and re-checks', async () => {
    let currentChannel = 'stable';
    let putBody = '';
    bun.fetch(async (input, init) => {
      const url = urlOf(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/api/settings/update-channel') && method === 'PUT') {
        putBody = typeof init?.body === 'string' ? init.body : '';
        currentChannel = JSON.parse(putBody).channel;
        return new Response('', { status: 204 });
      }
      if (url.includes('/api/settings/update-channel')) {
        return new Response(JSON.stringify({ channel: currentChannel }), { status: 200 });
      }
      return new Response(JSON.stringify(makeInfo({ channel: 'stable' })), { status: 200 });
    });

    const latest: { current: UseUpdates | null } = { current: null };
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
    expect(latest.current?.channel).toBe('stable');

    latest.current?.cycleChannel();
    await flush();

    expect(JSON.parse(putBody)).toEqual({ channel: 'canary' });
    expect(latest.current?.channel).toBe('canary');
    unmount();
  });

  test('startApply walks progress events and terminates on complete', async () => {
    bun.fetch(async (input) => {
      const url = urlOf(input);
      if (url.includes('/api/system/update/apply')) {
        return sseResponse([
          { phase: 'downloading', message: 'half' },
          { phase: 'installing' },
          { phase: 'complete', message: 'done' },
          { phase: 'checking', message: 'never seen' },
        ]);
      }
      if (url.includes('/api/settings/update-channel')) {
        return new Response(JSON.stringify({ channel: 'stable' }), { status: 200 });
      }
      return new Response(JSON.stringify(makeInfo()), { status: 200 });
    });

    const latest: { current: UseUpdates | null } = { current: null };
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
    latest.current?.startApply();
    await flush();

    expect(latest.current?.applying).toBe(false);
    expect(latest.current?.progress?.phase).toBe('complete');
    expect(latest.current?.progress?.message).toBe('done');
    expect(latest.current?.error).toBeNull();
    unmount();
  });

  test('startApply records the error and stops on a phase=error event', async () => {
    bun.fetch(async (input) => {
      const url = urlOf(input);
      if (url.includes('/api/system/update/apply')) {
        return sseResponse([
          { phase: 'downloading' },
          { phase: 'error', error: 'bad checksum' },
          { phase: 'complete' },
        ]);
      }
      if (url.includes('/api/settings/update-channel')) {
        return new Response(JSON.stringify({ channel: 'stable' }), { status: 200 });
      }
      return new Response(JSON.stringify(makeInfo()), { status: 200 });
    });

    const latest: { current: UseUpdates | null } = { current: null };
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
    latest.current?.startApply();
    await flush();

    expect(latest.current?.error).toBe('bad checksum');
    expect(latest.current?.progress?.phase).toBe('error');
    expect(latest.current?.applying).toBe(false);
    unmount();
  });

  test('startApply stops on phase=restarting without setting error', async () => {
    bun.fetch(async (input) => {
      const url = urlOf(input);
      if (url.includes('/api/system/update/apply')) {
        return sseResponse([
          { phase: 'installing' },
          { phase: 'restarting', message: 'goodbye' },
          { phase: 'complete' },
        ]);
      }
      if (url.includes('/api/settings/update-channel')) {
        return new Response(JSON.stringify({ channel: 'stable' }), { status: 200 });
      }
      return new Response(JSON.stringify(makeInfo()), { status: 200 });
    });

    const latest: { current: UseUpdates | null } = { current: null };
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
    latest.current?.startApply();
    await flush();

    expect(latest.current?.progress?.phase).toBe('restarting');
    expect(latest.current?.error).toBeNull();
    expect(latest.current?.applying).toBe(false);
    unmount();
  });
});
