/**
 * Unit tests for the self-update HTTP client — info, channel get/set,
 * and the SSE-backed apply generator.
 */
import { describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import {
  applyUpdate,
  fetchUpdateChannel,
  fetchUpdateInfo,
  setUpdateChannel,
  type UpdateChannelId,
  type UpdateInfoDto,
  type UpdateProgress,
} from './updates';

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function sseResponse(events: ReadonlyArray<unknown>): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

const sampleInfo: UpdateInfoDto = {
  currentVersion: '1.0.0',
  latestVersion: '1.1.0',
  updateAvailable: true,
  devBuild: false,
  releaseUrl: 'https://example/release',
  releaseNotes: 'notes',
  publishedAt: '2025-01-01T00:00:00Z',
  releaseCommit: 'abc',
  currentCommit: 'def',
  assetName: 'brika.tar.gz',
  assetSize: 12345,
  channel: 'stable',
  lastCheckedAt: '2025-01-02T00:00:00Z',
};

describe('fetchUpdateInfo', () => {
  const bun = useBunMock();

  test('returns the parsed body', async () => {
    bun.fetch(async () => new Response(JSON.stringify(sampleInfo), { status: 200 }));
    expect(await fetchUpdateInfo()).toEqual(sampleInfo);
  });

  test('throws on non-ok', () => {
    bun.fetch(async () => new Response('', { status: 502 }));
    expect(fetchUpdateInfo()).rejects.toThrow(/502/);
  });
});

describe('fetchUpdateChannel', () => {
  const bun = useBunMock();

  test('returns the channel id', async () => {
    bun.fetch(async () => new Response(JSON.stringify({ channel: 'canary' }), { status: 200 }));
    const channel: UpdateChannelId = await fetchUpdateChannel();
    expect(channel).toBe('canary');
  });

  test('throws on non-ok', () => {
    bun.fetch(async () => new Response('', { status: 500 }));
    expect(fetchUpdateChannel()).rejects.toThrow(/500/);
  });
});

describe('setUpdateChannel', () => {
  const bun = useBunMock();

  test('PUTs the channel and resolves on success', async () => {
    let method = '';
    let body = '';
    let contentType = '';
    bun.fetch(async (_input, init) => {
      method = init?.method ?? 'GET';
      body = typeof init?.body === 'string' ? init.body : '';
      contentType = new Headers(init?.headers).get('content-type') ?? '';
      return new Response('', { status: 204 });
    });

    await setUpdateChannel('canary');
    expect(method).toBe('PUT');
    expect(contentType).toBe('application/json');
    expect(JSON.parse(body)).toEqual({ channel: 'canary' });
  });

  test('throws including the server text on non-ok', () => {
    bun.fetch(async () => new Response('bad channel', { status: 400 }));
    expect(setUpdateChannel('stable')).rejects.toThrow(/set channel failed: 400 bad channel/);
  });
});

describe('applyUpdate', () => {
  const bun = useBunMock();

  test('yields progress events and stops on `complete`', async () => {
    bun.fetch(async () =>
      sseResponse([
        { phase: 'checking' },
        { phase: 'downloading', message: '50%' },
        { phase: 'complete' },
        { phase: 'never-yielded' },
      ])
    );

    const events: UpdateProgress[] = [];
    for await (const ev of applyUpdate()) {
      events.push(ev);
    }
    expect(events.map((e) => e.phase)).toEqual(['checking', 'downloading', 'complete']);
  });

  test('stops on `error`', async () => {
    bun.fetch(async () =>
      sseResponse([{ phase: 'verifying' }, { phase: 'error', error: 'bad sig' }, { phase: 'wat' }])
    );
    const events: UpdateProgress[] = [];
    for await (const ev of applyUpdate()) {
      events.push(ev);
    }
    expect(events).toHaveLength(2);
    expect(events.at(-1)?.phase).toBe('error');
  });

  test('stops on `restarting`', async () => {
    bun.fetch(async () =>
      sseResponse([{ phase: 'installing' }, { phase: 'restarting' }, { phase: 'should-not-yield' }])
    );
    const events: UpdateProgress[] = [];
    for await (const ev of applyUpdate()) {
      events.push(ev);
    }
    expect(events.map((e) => e.phase)).toEqual(['installing', 'restarting']);
  });

  test('appends ?force=true when force is set', async () => {
    let url = '';
    bun.fetch(async (input) => {
      url = urlOf(input);
      return sseResponse([{ phase: 'complete' }]);
    });
    for await (const _ of applyUpdate(true)) {
      // drain
    }
    expect(url).toContain('/api/system/update/apply?force=true');
  });

  test('omits the query string when force is falsy', async () => {
    let url = '';
    bun.fetch(async (input) => {
      url = urlOf(input);
      return sseResponse([{ phase: 'complete' }]);
    });
    for await (const _ of applyUpdate()) {
      // drain
    }
    expect(url).not.toContain('?force=true');
  });

  test('throws when the apply request fails to start', () => {
    bun.fetch(async () => new Response('nope', { status: 500 }));
    const run = async () => {
      for await (const _ of applyUpdate()) {
        // unreachable
      }
    };
    expect(run()).rejects.toThrow(/apply failed to start: 500 nope/);
  });
});
