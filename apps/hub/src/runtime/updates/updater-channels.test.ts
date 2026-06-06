/**
 * Channel-routing tests for `checkForUpdate`.
 *
 * The default-channel path is covered in `updater.test.ts`; this file
 * exercises the three other branches in `fetchLatestRelease`:
 *
 *   - pinned   → /releases/tags/v<version>
 *   - stable   → /releases/latest        (covered elsewhere)
 *   - beta     → /releases list, pick the first `-rc.N` / `-beta.N`
 *   - canary   → /releases list, pick the first prerelease that
 *                isn't beta-shaped
 *
 * Each test stubs `globalThis.fetch` (no etag header so the module-
 * level cache doesn't accumulate across tests) and asserts both the
 * URL that was hit and the chosen release.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { realFetch } from '@brika/testing';
import { checkForUpdate } from '@/runtime/updates/updater';

interface GhAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

function makeReleaseJson(tag: string, opts?: { prerelease?: boolean; assets?: GhAsset[] }): string {
  return JSON.stringify({
    tag_name: tag,
    target_commitish: 'main',
    published_at: '2026-01-01T00:00:00Z',
    html_url: `https://github.com/brikalabs/brika/releases/tag/${tag}`,
    body: 'notes',
    prerelease: opts?.prerelease ?? false,
    assets: opts?.assets ?? [],
  });
}

function makeListJson(entries: ReadonlyArray<{ tag: string; prerelease: boolean }>): string {
  return JSON.stringify(
    entries.map(({ tag, prerelease }) => JSON.parse(makeReleaseJson(tag, { prerelease })))
  );
}

function urlOf(input: string | URL | Request): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function jsonResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('checkForUpdate — pinned channel', () => {
  let mockFetch: ReturnType<typeof mock>;
  let seenUrls: string[];

  beforeEach(() => {
    seenUrls = [];
    mockFetch = mock<typeof fetch>();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('hits /releases/tags/v<version> with the version prefixed', async () => {
    mockFetch.mockImplementation((input: string | URL | Request) => {
      const url = urlOf(input);
      seenUrls.push(url);
      if (url.includes('release-meta.json')) {
        return Promise.resolve(new Response('Not Found', { status: 404 }));
      }
      return Promise.resolve(jsonResponse(makeReleaseJson('v0.5.2')));
    });

    const info = await checkForUpdate('pinned', { pinnedVersion: '0.5.2' });
    expect(info.latestVersion).toBe('0.5.2');
    expect(info.channel).toBe('pinned');
    expect(seenUrls.some((u) => u.endsWith('/releases/tags/v0.5.2'))).toBe(true);
  });

  test('uses the user-supplied prefix verbatim if it already starts with v', async () => {
    mockFetch.mockImplementation((input: string | URL | Request) => {
      const url = urlOf(input);
      seenUrls.push(url);
      if (url.includes('release-meta.json')) {
        return Promise.resolve(new Response('Not Found', { status: 404 }));
      }
      return Promise.resolve(jsonResponse(makeReleaseJson('v0.6.0-rc.1')));
    });

    await checkForUpdate('pinned', { pinnedVersion: 'v0.6.0-rc.1' });
    // Must not double-prefix to "vv0.6.0-rc.1".
    expect(seenUrls.some((u) => u.includes('/releases/tags/v0.6.0-rc.1'))).toBe(true);
    expect(seenUrls.every((u) => !u.includes('vv0.'))).toBe(true);
  });

  test('throws when pinned channel is selected with no version', async () => {
    await expect(checkForUpdate('pinned', { pinnedVersion: null })).rejects.toThrow(
      /Pinned channel selected but no version was set/
    );
    await expect(checkForUpdate('pinned', { pinnedVersion: '' })).rejects.toThrow(
      /Pinned channel selected but no version was set/
    );
  });
});

describe('checkForUpdate — beta + canary channels', () => {
  let mockFetch: ReturnType<typeof mock>;
  let seenUrls: string[];

  beforeEach(() => {
    seenUrls = [];
    mockFetch = mock<typeof fetch>();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function stubReleaseList(entries: ReadonlyArray<{ tag: string; prerelease: boolean }>): void {
    mockFetch.mockImplementation((input: string | URL | Request) => {
      const url = urlOf(input);
      seenUrls.push(url);
      if (url.includes('release-meta.json')) {
        return Promise.resolve(new Response('Not Found', { status: 404 }));
      }
      return Promise.resolve(jsonResponse(makeListJson(entries)));
    });
  }

  test('beta picks the first `-rc.N` prerelease', async () => {
    stubReleaseList([
      { tag: 'v0.6.0-canary.20260520', prerelease: true },
      { tag: 'v0.6.0-rc.1', prerelease: true },
      { tag: 'v0.6.0-rc.2', prerelease: true },
      { tag: 'v0.5.0', prerelease: false }, // stable — filtered out
    ]);

    const info = await checkForUpdate('beta');
    expect(info.latestVersion).toBe('0.6.0-rc.1');
    expect(info.channel).toBe('beta');
    expect(seenUrls.some((u) => u.includes('/releases?per_page=10'))).toBe(true);
  });

  test('beta picks the first `-beta.N` prerelease when no rc is present', async () => {
    stubReleaseList([
      { tag: 'v0.6.0-canary.20260520', prerelease: true },
      { tag: 'v0.6.0-beta.3', prerelease: true },
    ]);

    const info = await checkForUpdate('beta');
    expect(info.latestVersion).toBe('0.6.0-beta.3');
  });

  test('canary picks the first non-(rc|beta) prerelease', async () => {
    stubReleaseList([
      { tag: 'v0.6.0-rc.1', prerelease: true }, // beta-shaped — skipped
      { tag: 'v0.6.0-canary.20260520', prerelease: true }, // picked
      { tag: 'v0.6.0-canary.20260519', prerelease: true },
      { tag: 'v0.5.0', prerelease: false },
    ]);

    const info = await checkForUpdate('canary');
    expect(info.latestVersion).toBe('0.6.0-canary.20260520');
    expect(info.channel).toBe('canary');
  });

  test('canary falls back to the first prerelease overall when no canary-shape exists', async () => {
    stubReleaseList([
      { tag: 'v0.6.0-rc.1', prerelease: true },
      { tag: 'v0.6.0-rc.2', prerelease: true },
    ]);

    const info = await checkForUpdate('canary');
    // Falls back to the first prerelease — even though it's rc-shaped.
    expect(info.latestVersion).toBe('0.6.0-rc.1');
  });

  test('beta throws when no rc/beta prerelease is found', async () => {
    stubReleaseList([
      { tag: 'v0.6.0-canary.20260520', prerelease: true },
      { tag: 'v0.5.0', prerelease: false },
    ]);

    await expect(checkForUpdate('beta')).rejects.toThrow(/No beta release found/);
  });

  test('canary throws when no prerelease exists at all', async () => {
    stubReleaseList([
      { tag: 'v0.5.0', prerelease: false },
      { tag: 'v0.4.0', prerelease: false },
    ]);

    await expect(checkForUpdate('canary')).rejects.toThrow(/No canary release found/);
  });
});
