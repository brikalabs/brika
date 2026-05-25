/**
 * Single-flight coalescing — two callers issuing the same GET share one
 * upstream call. Failures must NOT be cached (one timeout would poison
 * every subsequent caller).
 */

import { describe, expect, test } from 'bun:test';
import type { FetchArgs } from '@brika/sdk/grants';
import { SingleFlightCache, singleFlightKey } from '../single-flight';

const baseArgs: FetchArgs = { url: 'https://api.example.com/x', method: 'GET' };

describe('singleFlightKey', () => {
  test('identical args produce identical keys', () => {
    expect(singleFlightKey(baseArgs)).toBe(singleFlightKey(baseArgs));
  });

  test('different urls → different keys', () => {
    expect(singleFlightKey(baseArgs)).not.toBe(
      singleFlightKey({ ...baseArgs, url: 'https://api.example.com/y' })
    );
  });

  test('different methods → different keys', () => {
    expect(singleFlightKey({ ...baseArgs, method: 'HEAD' })).not.toBe(singleFlightKey(baseArgs));
  });

  test('header case differences DO collide (case-insensitive HTTP)', () => {
    const a = { ...baseArgs, headers: { Authorization: 'Bearer x' } };
    const b = { ...baseArgs, headers: { authorization: 'Bearer x' } };
    expect(singleFlightKey(a)).toBe(singleFlightKey(b));
  });

  test('header value differences → different keys', () => {
    const a = { ...baseArgs, headers: { Authorization: 'Bearer a' } };
    const b = { ...baseArgs, headers: { Authorization: 'Bearer b' } };
    expect(singleFlightKey(a)).not.toBe(singleFlightKey(b));
  });

  test('header order does NOT matter (sorted internally)', () => {
    const a = { ...baseArgs, headers: { 'X-A': '1', 'X-B': '2' } };
    const b = { ...baseArgs, headers: { 'X-B': '2', 'X-A': '1' } };
    expect(singleFlightKey(a)).toBe(singleFlightKey(b));
  });
});

describe('SingleFlightCache', () => {
  test('coalesces concurrent callers on the same key', async () => {
    const cache = new SingleFlightCache();
    let upstreamCalls = 0;
    const promise = () =>
      cache.run('key', async () => {
        upstreamCalls += 1;
        // Yield once so all three concurrent callers register on the
        // single-flight entry before the upstream settles.
        await Promise.resolve();
        return { status: 200, statusText: '', headers: {}, body: 'hi', attempts: 1 };
      });
    const [a, b, c] = await Promise.all([promise(), promise(), promise()]);
    expect(upstreamCalls).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  test('releases the entry after settle (next caller re-fetches)', async () => {
    const cache = new SingleFlightCache();
    let calls = 0;
    const run = () =>
      cache.run('k', async () => {
        calls += 1;
        return { status: 200, statusText: '', headers: {}, body: 'hi', attempts: 1 };
      });
    await run();
    await run();
    expect(calls).toBe(2);
    expect(cache.size()).toBe(0);
  });

  test('does NOT cache failures (next caller retries)', async () => {
    const cache = new SingleFlightCache();
    let calls = 0;
    const run = () =>
      cache.run('k', async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error('boom');
        }
        return { status: 200, statusText: '', headers: {}, body: 'ok', attempts: 1 };
      });
    await expect(run()).rejects.toThrow('boom');
    const result = await run();
    expect(result.body).toBe('ok');
    expect(calls).toBe(2);
  });

  test('different keys do NOT coalesce', async () => {
    const cache = new SingleFlightCache();
    let calls = 0;
    const factory = async () => {
      calls += 1;
      return { status: 200, statusText: '', headers: {}, body: '', attempts: 1 };
    };
    await Promise.all([cache.run('a', factory), cache.run('b', factory)]);
    expect(calls).toBe(2);
  });
});
