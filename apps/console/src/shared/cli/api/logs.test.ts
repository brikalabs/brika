/** Unit tests for the logs HTTP client — recent tail + server-side query. */
import { describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import { fetchRecentLogs, queryLogs } from './logs';

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

describe('fetchRecentLogs', () => {
  const bun = useBunMock();

  test('returns events from the wrapped response shape', async () => {
    bun.fetch(
      async () =>
        new Response(
          JSON.stringify({
            events: [{ ts: 1, level: 'info', source: 'hub', message: 'hello' }],
          }),
          { status: 200 }
        )
    );
    const result = await fetchRecentLogs();
    expect(result).toEqual([{ ts: 1, level: 'info', source: 'hub', message: 'hello' }]);
  });

  test('accepts a plain array body', async () => {
    bun.fetch(
      async () =>
        new Response(JSON.stringify([{ ts: 1, level: 'info', source: 'hub', message: 'hi' }]), {
          status: 200,
        })
    );
    const result = await fetchRecentLogs();
    expect(result).toHaveLength(1);
  });

  test('returns an empty list when events is missing', async () => {
    bun.fetch(async () => new Response(JSON.stringify({}), { status: 200 }));
    expect(await fetchRecentLogs()).toEqual([]);
  });

  test('throws on non-ok', () => {
    bun.fetch(async () => new Response('', { status: 500 }));
    expect(fetchRecentLogs()).rejects.toThrow(/500/);
  });
});

describe('queryLogs', () => {
  const bun = useBunMock();

  test('issues a bare /api/logs request when no params are given', async () => {
    let url = '';
    bun.fetch(async (input) => {
      url = urlOf(input);
      return new Response(JSON.stringify({ logs: [], nextCursor: null }), { status: 200 });
    });
    await queryLogs();
    expect(url).toContain('/api/logs');
    expect(url).not.toContain('?');
  });

  test('builds the query string with every supported param', async () => {
    let url = '';
    bun.fetch(async (input) => {
      url = urlOf(input);
      return new Response(JSON.stringify({ logs: [], nextCursor: null }), { status: 200 });
    });

    await queryLogs({
      search: 'boom',
      level: ['error', 'warn'],
      source: ['hub', 'plugin'],
      pluginName: 'foo',
      startTs: 1000,
      endTs: 2000,
      cursor: 99,
      limit: 50,
      order: 'desc',
    });

    const qs = new URL(url).searchParams;
    expect(qs.get('search')).toBe('boom');
    expect(qs.get('level')).toBe('error,warn');
    expect(qs.get('source')).toBe('hub,plugin');
    expect(qs.get('pluginName')).toBe('foo');
    expect(qs.get('startTs')).toBe('1000');
    expect(qs.get('endTs')).toBe('2000');
    expect(qs.get('cursor')).toBe('99');
    expect(qs.get('limit')).toBe('50');
    expect(qs.get('order')).toBe('desc');
  });

  test('omits empty level/source arrays', async () => {
    let url = '';
    bun.fetch(async (input) => {
      url = urlOf(input);
      return new Response(JSON.stringify({ logs: [], nextCursor: null }), { status: 200 });
    });

    await queryLogs({ level: [], source: [] });
    expect(url).not.toContain('level=');
    expect(url).not.toContain('source=');
  });

  test('returns the parsed body', async () => {
    bun.fetch(
      async () =>
        new Response(
          JSON.stringify({
            logs: [{ id: 1, ts: 0, level: 'info', source: 'hub', message: 'hi' }],
            nextCursor: 2,
          }),
          { status: 200 }
        )
    );
    const result = await queryLogs({ search: 'hi' });
    expect(result.nextCursor).toBe(2);
    expect(result.logs).toHaveLength(1);
  });

  test('throws on non-ok', () => {
    bun.fetch(async () => new Response('', { status: 502 }));
    expect(queryLogs({ search: 'x' })).rejects.toThrow(/502/);
  });
});
