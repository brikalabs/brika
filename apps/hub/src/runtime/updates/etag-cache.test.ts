/**
 * ETag cache tests — verify the four documented behaviours of
 * `GithubEtagCache.fetchJson`:
 *
 *   1. 200 with `etag` header populates the cache; the next call
 *      sends `If-None-Match`.
 *   2. 304 with a cached entry replays the cached body, schema-
 *      validated.
 *   3. 403 / 429 with a cached entry falls back to cache rather than
 *      throwing (stale-while-rate-limited).
 *   4. 200 without an `etag` header doesn't poison the cache.
 *
 * Plus the schema-failure paths the cache is supposed to swallow:
 *
 *   5. A cached entry whose persisted shape no longer matches the
 *      caller's schema is invalidated, NOT replayed.
 *   6. Corrupt cache file (bad JSON) parses to `{}` and subsequent
 *      fetches populate fresh.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useBunMock } from '@brika/testing';
import { z } from 'zod';
import { GithubEtagCache } from './etag-cache';

const PayloadSchema = z.object({ tag: z.string() });

let brikaDir: string;
const URL = 'https://api.github.com/repos/x/releases/latest';

beforeEach(() => {
  brikaDir = mkdtempSync(join(tmpdir(), 'brika-etag-'));
});

afterEach(() => {
  rmSync(brikaDir, { recursive: true, force: true });
});

describe('GithubEtagCache.fetchJson', () => {
  const bun = useBunMock();

  test('200 with etag populates the cache + next call sends If-None-Match', async () => {
    let lastHeaders: Headers | undefined;
    let callCount = 0;
    bun.fetch((_url, init) => {
      lastHeaders = new Headers(init?.headers);
      callCount += 1;
      return Promise.resolve(
        new Response(JSON.stringify({ tag: 'v1' }), {
          status: 200,
          headers: { etag: 'W/"abc"', 'content-type': 'application/json' },
        })
      );
    });

    const cache = new GithubEtagCache(brikaDir);
    const first = await cache.fetchJson(URL, PayloadSchema);
    expect(first.fromCache).toBe(false);
    expect(first.body.tag).toBe('v1');
    expect(lastHeaders?.has('If-None-Match')).toBe(false);

    // Second call — same URL, fresh stub — must send If-None-Match.
    bun
      .fetch((_url, init) => {
        lastHeaders = new Headers(init?.headers);
        callCount += 1;
        return Promise.resolve(new Response('', { status: 304 }));
      })
      .apply();

    const second = await cache.fetchJson(URL, PayloadSchema);
    expect(second.fromCache).toBe(true);
    expect(second.body.tag).toBe('v1');
    expect(lastHeaders?.get('If-None-Match')).toBe('W/"abc"');
    expect(callCount).toBe(2);
  });

  test('403 / 429 with a cached entry falls back to cache (stale-while-rate-limited)', async () => {
    bun.fetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ tag: 'v2' }), {
          status: 200,
          headers: { etag: '"e"', 'content-type': 'application/json' },
        })
      )
    );
    const cache = new GithubEtagCache(brikaDir);
    await cache.fetchJson(URL, PayloadSchema);

    bun.fetch(() => Promise.resolve(new Response('rate limited', { status: 429 }))).apply();
    const replay = await cache.fetchJson(URL, PayloadSchema);
    expect(replay.fromCache).toBe(true);
    expect(replay.body.tag).toBe('v2');

    bun.fetch(() => Promise.resolve(new Response('forbidden', { status: 403 }))).apply();
    const replay2 = await cache.fetchJson(URL, PayloadSchema);
    expect(replay2.fromCache).toBe(true);
  });

  test('429 without a cached entry throws', async () => {
    bun.fetch(() => Promise.resolve(new Response('rate limited', { status: 429 }))).apply();
    const cache = new GithubEtagCache(brikaDir);
    await expect(cache.fetchJson(URL, PayloadSchema)).rejects.toThrow(/429/);
  });

  test('200 without an etag header leaves the cache untouched', async () => {
    bun.fetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ tag: 'v3' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
    const cache = new GithubEtagCache(brikaDir);
    await cache.fetchJson(URL, PayloadSchema);

    // No persisted entry → file doesn't exist OR is empty.
    const cachePath = join(brikaDir, '.github-etag.json');
    if (existsSync(cachePath)) {
      const data = JSON.parse(readFileSync(cachePath, 'utf8'));
      expect(data[URL]).toBeUndefined();
    }
  });

  test('cached entry whose schema no longer matches is invalidated', async () => {
    // Pre-populate the cache with a body that does NOT match
    // PayloadSchema (missing `tag` field).
    const cachePath = join(brikaDir, '.github-etag.json');
    writeFileSync(
      cachePath,
      JSON.stringify({
        [URL]: { etag: '"old"', lastFetched: Date.now(), body: { wrong: 'shape' } },
      })
    );

    bun.fetch(() => Promise.resolve(new Response('', { status: 304 }))).apply();

    const cache = new GithubEtagCache(brikaDir);
    await expect(cache.fetchJson(URL, PayloadSchema)).rejects.toThrow(/schema mismatch/);

    // After the throw, the stale entry should be evicted so the
    // caller's retry (with a fresh fetch yielding a real body)
    // would populate from scratch.
    const after = JSON.parse(readFileSync(cachePath, 'utf8'));
    expect(after[URL]).toBeUndefined();
  });

  test('corrupt cache file is treated as empty', async () => {
    writeFileSync(join(brikaDir, '.github-etag.json'), '{not valid json');
    bun
      .fetch(() =>
        Promise.resolve(
          new Response(JSON.stringify({ tag: 'v9' }), {
            status: 200,
            headers: { etag: '"e"', 'content-type': 'application/json' },
          })
        )
      )
      .apply();
    const cache = new GithubEtagCache(brikaDir);
    const result = await cache.fetchJson(URL, PayloadSchema);
    expect(result.fromCache).toBe(false);
    expect(result.body.tag).toBe('v9');
  });
});
