/**
 * Unit tests for the plugin lifecycle HTTP client. All requests go through
 * the global `fetch` mocked via `@brika/testing`'s `useBunMock`.
 */
import { describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import {
  fetchPluginMetrics,
  fetchPluginReadme,
  fetchPlugins,
  pluginAction,
  uninstallPlugin,
} from './plugins';

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

describe('fetchPlugins', () => {
  const bun = useBunMock();

  test('returns the plugin list from the wrapped response shape', async () => {
    bun.fetch(
      async () =>
        new Response(
          JSON.stringify({
            plugins: [{ uid: 'a', name: 'a', version: '1', status: 'running', pid: 1 }],
          }),
          { status: 200 }
        )
    );
    const result = await fetchPlugins();
    expect(result).toEqual([{ uid: 'a', name: 'a', version: '1', status: 'running', pid: 1 }]);
  });

  test('accepts a plain array body too (some endpoints return that shape)', async () => {
    bun.fetch(
      async () =>
        new Response(
          JSON.stringify([{ uid: 'a', name: 'a', version: '1', status: 'stopped', pid: null }]),
          { status: 200 }
        )
    );
    const result = await fetchPlugins();
    expect(result).toHaveLength(1);
    expect(result[0]?.pid).toBeNull();
  });

  test('throws on non-ok', () => {
    bun.fetch(async () => new Response('boom', { status: 500 }));
    expect(fetchPlugins()).rejects.toThrow(/500/);
  });
});

describe('fetchPluginReadme', () => {
  const bun = useBunMock();

  test('returns the readme markdown', async () => {
    bun.fetch(
      async () =>
        new Response(JSON.stringify({ readme: '# Hello', filename: 'README.md' }), { status: 200 })
    );
    expect(await fetchPluginReadme('foo')).toBe('# Hello');
  });

  test('returns an empty string when readme is null', async () => {
    bun.fetch(
      async () => new Response(JSON.stringify({ readme: null, filename: null }), { status: 200 })
    );
    expect(await fetchPluginReadme('foo')).toBe('');
  });

  test('url-encodes the plugin uid', async () => {
    let seenUrl = '';
    bun.fetch(async (input) => {
      seenUrl = urlOf(input);
      return new Response(JSON.stringify({ readme: '' }), { status: 200 });
    });
    await fetchPluginReadme('scope/name');
    expect(seenUrl).toContain('/api/plugins/scope%2Fname/readme');
  });

  test('throws on non-ok', () => {
    bun.fetch(async () => new Response('nope', { status: 404 }));
    expect(fetchPluginReadme('x')).rejects.toThrow(/404/);
  });
});

describe('pluginAction', () => {
  const bun = useBunMock();

  test('POSTs to the correct path and resolves on success', async () => {
    let method = '';
    let url = '';
    bun.fetch(async (input, init) => {
      url = urlOf(input);
      method = init?.method ?? 'GET';
      return new Response('', { status: 204 });
    });
    await pluginAction('foo', 'reload');
    expect(method).toBe('POST');
    expect(url).toContain('/api/plugins/foo/reload');
  });

  test('throws when the hub returns a non-ok status', () => {
    bun.fetch(async () => new Response('nope', { status: 503 }));
    expect(pluginAction('foo', 'enable')).rejects.toThrow(/enable failed: 503/);
  });
});

describe('fetchPluginMetrics', () => {
  const bun = useBunMock();

  test('returns the parsed metrics body', async () => {
    const payload = {
      pid: 42,
      current: { cpu: 1.2, memory: 1024 },
      history: [{ cpu: 0.1, memory: 512, ts: 1 }],
    };
    bun.fetch(async () => new Response(JSON.stringify(payload), { status: 200 }));
    expect(await fetchPluginMetrics('foo')).toEqual(payload);
  });

  test('throws on non-ok', () => {
    bun.fetch(async () => new Response('', { status: 500 }));
    expect(fetchPluginMetrics('foo')).rejects.toThrow(/500/);
  });
});

describe('uninstallPlugin', () => {
  const bun = useBunMock();

  test('issues a DELETE and resolves on success', async () => {
    let method = '';
    let url = '';
    bun.fetch(async (input, init) => {
      url = urlOf(input);
      method = init?.method ?? 'GET';
      return new Response('', { status: 204 });
    });
    await uninstallPlugin('foo');
    expect(method).toBe('DELETE');
    expect(url).toContain('/api/plugins/foo');
  });

  test('throws on non-ok and includes the body text', () => {
    bun.fetch(async () => new Response('already gone', { status: 409 }));
    expect(uninstallPlugin('foo')).rejects.toThrow(/uninstall failed: 409 already gone/);
  });
});
