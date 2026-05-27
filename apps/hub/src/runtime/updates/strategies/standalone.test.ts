/**
 * StandaloneStrategy is the production code path on POSIX
 * `~/.brika/bin/brika` installs. Most of the heavy lifting (download,
 * extract, swap) is delegated to `applyUpdate` and exercised in
 * `updater.test.ts`; this file just pins the delegation shape so a
 * future refactor can't silently change the public surface.
 *
 * `apply()` is NOT invoked here — it would touch the real install.
 * `check()` is too because `checkForUpdate` reaches the GitHub API,
 * which is fine under our existing fetch mocking.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { realFetch } from '@brika/testing';
import { StandaloneStrategy } from './standalone';

let mockFetch: ReturnType<typeof mock>;

beforeEach(() => {
  mockFetch = mock<typeof fetch>();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('StandaloneStrategy', () => {
  test('exposes name = "standalone"', () => {
    expect(new StandaloneStrategy().name).toBe('standalone');
  });

  test('canApply() is true (POSIX-only path the orchestrator picks)', () => {
    expect(new StandaloneStrategy().canApply()).toBe(true);
  });

  test('check() delegates to checkForUpdate with the supplied channel', async () => {
    mockFetch.mockImplementation((input: string | URL | Request) => {
      let url: string;
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else {
        url = input.url;
      }
      if (url.includes('release-meta.json')) {
        return Promise.resolve(new Response('Not Found', { status: 404 }));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            tag_name: 'v9.9.9',
            target_commitish: 'main',
            published_at: '2026-01-01T00:00:00Z',
            html_url: 'https://x',
            body: '',
            prerelease: false,
            assets: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    });

    const strategy = new StandaloneStrategy();
    const info = await strategy.check('stable');
    expect(info.channel).toBe('stable');
    expect(info.latestVersion).toBe('9.9.9');
  });
});
