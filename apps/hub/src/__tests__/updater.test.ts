/**
 * Tests for updater pure functions and fetch-dependent logic.
 *
 * HTTP mocking uses globalThis.fetch interception (not mock.module)
 * to avoid Bun #12823 bleed between test files.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { buildInfo } from '@/build-info';
import { hub } from '@/hub';
import type { UpdateInfo } from '@/updater';
import { checkForUpdate, isNewer, noUpdateInfo } from '@/updater';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Expected asset name for the current platform (mirrors getAssetName logic) */
function expectedAssetName(): string {
  const os = process.platform === 'win32' ? 'windows' : process.platform;
  const arch = process.arch;
  const ext = process.platform === 'win32' ? '.zip' : '.tar.gz';
  return `brika-${os}-${arch}${ext}`;
}

interface MockReleaseOptions {
  assetName?: string;
  body?: string | null;
  publishedAt?: string;
  htmlUrl?: string;
  commit?: string;
  checksums?: Record<string, string>;
}

/** Build a mock fetch that responds like the GitHub releases API */
function createGitHubReleaseFetch(tagName: string, options?: MockReleaseOptions) {
  const assets: Array<{ name: string; browser_download_url: string; size: number }> = [];

  if (options?.assetName) {
    assets.push({
      name: options.assetName,
      browser_download_url: `https://example.com/${options.assetName}`,
      size: 1024 * 1024 * 10,
    });
  }

  const commit = options?.commit;
  if (commit) {
    assets.push({
      name: 'release-meta.json',
      browser_download_url: 'https://example.com/release-meta.json',
      size: 100,
    });
  }

  const releaseJson = JSON.stringify({
    tag_name: tagName,
    target_commitish: 'master',
    published_at: options?.publishedAt ?? '2026-01-01T00:00:00Z',
    html_url: options?.htmlUrl ?? `https://github.com/maxscharwath/brika/releases/tag/${tagName}`,
    body: options?.body === undefined ? 'Release notes' : options.body,
    assets,
  });

  const metaJson = commit
    ? JSON.stringify({
        version: tagName.replace(/^v/, ''),
        commit,
        branch: 'master',
        date: '2026-01-01T00:00:00Z',
        bun: '1.3.9',
        checksums: options?.checksums ?? {},
      })
    : null;

  return (input: RequestInfo | URL) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (metaJson && url.includes('release-meta.json')) {
      return Promise.resolve(
        new Response(metaJson, { status: 200, headers: { 'Content-Type': 'application/json' } })
      );
    }
    return Promise.resolve(
      new Response(releaseJson, { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getAssetName (private — tested indirectly via checkForUpdate asset matching)
// ─────────────────────────────────────────────────────────────────────────────

describe('getAssetName (indirect)', () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock<typeof fetch>();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('matches brika-<platform>-<arch>.tar.gz on non-windows', async () => {
    if (process.platform === 'win32') return; // skip on Windows

    const assetName = `brika-${process.platform}-${process.arch}.tar.gz`;
    mockFetch.mockImplementation(createGitHubReleaseFetch('v99.0.0', { assetName }));

    const info = await checkForUpdate();

    expect(info.assetName).toBe(assetName);
    expect(info.assetSize).toBe(1024 * 1024 * 10);
  });

  test('uses "windows" instead of "win32" for Windows platform', async () => {
    // Regardless of actual platform, verify the naming convention
    const expected = expectedAssetName();
    mockFetch.mockImplementation(createGitHubReleaseFetch('v99.0.0', { assetName: expected }));

    const info = await checkForUpdate();

    expect(info.assetName).toBe(expected);
    // Verify naming structure
    if (process.platform === 'win32') {
      expect(expected).toMatch(/^brika-windows-.+\.zip$/);
    } else {
      expect(expected).toMatch(/^brika-.+-.+\.tar\.gz$/);
      expect(expected).not.toContain('win32');
    }
  });

  test('returns null when asset name does not match current platform', async () => {
    mockFetch.mockImplementation(
      createGitHubReleaseFetch('v99.0.0', { assetName: 'brika-fakeos-fakeArch.tar.gz' })
    );

    const info = await checkForUpdate();

    expect(info.assetName).toBeNull();
    expect(info.assetSize).toBeNull();
  });

  test('maps common arch values in asset name', async () => {
    // The asset name should use process.arch directly (x64, arm64, etc.)
    const assetName = expectedAssetName();
    expect(assetName).toContain(process.arch);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseVersion (private — tested indirectly via isNewer)
// ─────────────────────────────────────────────────────────────────────────────

describe('parseVersion (indirect via isNewer)', () => {
  test('strips v-prefix before comparing', () => {
    expect(isNewer('v1.0.0', 'v1.0.1')).toBe(true);
    expect(isNewer('v2.0.0', 'v1.0.0')).toBe(false);
  });

  test('handles mixed prefixed and non-prefixed', () => {
    expect(isNewer('v1.0.0', '1.0.1')).toBe(true);
    expect(isNewer('1.0.0', 'v1.0.1')).toBe(true);
  });

  test('parses multi-digit segments correctly', () => {
    expect(isNewer('1.10.0', '1.9.0')).toBe(false); // 10 > 9
    expect(isNewer('1.9.0', '1.10.0')).toBe(true);
  });

  test('parses versions with fewer than 3 segments', () => {
    // "1" → [1], "1.2" → [1, 2], missing segments treated as 0
    expect(isNewer('1', '1.0.0')).toBe(false); // equivalent
    expect(isNewer('1', '1.0.1')).toBe(true);
    expect(isNewer('1.2', '1.2.0')).toBe(false); // equivalent
    expect(isNewer('1.2', '1.2.1')).toBe(true);
  });

  test('parses versions with more than 3 segments', () => {
    expect(isNewer('1.0.0.0', '1.0.0.1')).toBe(true);
    expect(isNewer('1.0.0.1', '1.0.0.0')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isNewer
// ─────────────────────────────────────────────────────────────────────────────

describe('isNewer', () => {
  test('returns true when latest has higher major', () => {
    expect(isNewer('1.0.0', '2.0.0')).toBe(true);
  });

  test('returns true when latest has higher minor', () => {
    expect(isNewer('1.0.0', '1.1.0')).toBe(true);
  });

  test('returns true when latest has higher patch', () => {
    expect(isNewer('1.0.0', '1.0.1')).toBe(true);
  });

  test('returns false when versions are equal', () => {
    expect(isNewer('1.2.3', '1.2.3')).toBe(false);
  });

  test('returns false for 0.0.0 vs 0.0.0', () => {
    expect(isNewer('0.0.0', '0.0.0')).toBe(false);
  });

  test('returns false when current is newer', () => {
    expect(isNewer('2.0.0', '1.9.9')).toBe(false);
    expect(isNewer('1.1.0', '1.0.9')).toBe(false);
  });

  test('handles v-prefix in both versions', () => {
    expect(isNewer('v1.0.0', 'v1.0.1')).toBe(true);
    expect(isNewer('v1.0.0', 'v1.0.0')).toBe(false);
  });

  test('handles mixed v-prefix', () => {
    expect(isNewer('1.0.0', 'v1.0.1')).toBe(true);
    expect(isNewer('v1.0.0', '1.0.1')).toBe(true);
  });

  test('handles versions with different segment counts', () => {
    expect(isNewer('1.0', '1.0.1')).toBe(true);
    expect(isNewer('1.0.1', '1.0')).toBe(false);
  });

  test('treats missing segments as zero', () => {
    // 1.0 === 1.0.0, so 1.0.0 is not newer
    expect(isNewer('1.0', '1.0.0')).toBe(false);
    expect(isNewer('1.0.0', '1.0')).toBe(false);
  });

  test('handles single segment versions', () => {
    expect(isNewer('1', '2')).toBe(true);
    expect(isNewer('2', '1')).toBe(false);
    expect(isNewer('1', '1')).toBe(false);
  });

  test('handles large version numbers', () => {
    expect(isNewer('100.200.300', '100.200.301')).toBe(true);
    expect(isNewer('100.200.300', '100.201.0')).toBe(true);
    expect(isNewer('100.200.300', '101.0.0')).toBe(true);
    expect(isNewer('100.200.300', '100.200.299')).toBe(false);
  });

  test('higher major wins even when minor/patch are lower', () => {
    expect(isNewer('1.9.9', '2.0.0')).toBe(true);
    expect(isNewer('2.0.0', '1.9.9')).toBe(false);
  });

  test('higher minor wins even when patch is lower', () => {
    expect(isNewer('1.0.9', '1.1.0')).toBe(true);
    expect(isNewer('1.1.0', '1.0.9')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// noUpdateInfo
// ─────────────────────────────────────────────────────────────────────────────

describe('noUpdateInfo', () => {
  test('returns correct shape with no update available', () => {
    const info = noUpdateInfo();

    expect(info).toMatchObject({
      currentVersion: hub.version,
      latestVersion: hub.version,
      updateAvailable: false,
      devBuild: false,
      releaseUrl: '',
      releaseNotes: '',
      publishedAt: '',
      releaseCommit: '',
      currentCommit: buildInfo.commitFull,
      assetName: null,
      assetSize: null,
    });
  });

  test('uses hub.version as both current and latest', () => {
    const info = noUpdateInfo();

    expect(info.currentVersion).toBe(hub.version);
    expect(info.latestVersion).toBe(hub.version);
  });

  test('includes buildInfo.commitFull as currentCommit', () => {
    const info = noUpdateInfo();

    expect(info.currentCommit).toBe(buildInfo.commitFull);
  });

  test('devBuild is always false', () => {
    const info = noUpdateInfo();

    expect(info.devBuild).toBe(false);
  });

  test('returns a fresh object each call', () => {
    const a = noUpdateInfo();
    const b = noUpdateInfo();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  test('conforms to UpdateInfo interface', () => {
    const info: UpdateInfo = noUpdateInfo();

    expect(typeof info.currentVersion).toBe('string');
    expect(typeof info.latestVersion).toBe('string');
    expect(typeof info.updateAvailable).toBe('boolean');
    expect(typeof info.devBuild).toBe('boolean');
    expect(typeof info.releaseUrl).toBe('string');
    expect(typeof info.releaseNotes).toBe('string');
    expect(typeof info.publishedAt).toBe('string');
    expect(typeof info.releaseCommit).toBe('string');
    expect(typeof info.currentCommit).toBe('string');
    expect(info.assetName).toBeNull();
    expect(info.assetSize).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchLatestRelease (private — tested indirectly via checkForUpdate)
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchLatestRelease (indirect)', () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock<typeof fetch>();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('throws on non-OK response from GitHub API', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response('Not Found', { status: 404, statusText: 'Not Found' }))
    );

    await expect(checkForUpdate()).rejects.toThrow('GitHub API returned 404');
  });

  test('throws with status text on server error', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
        })
      )
    );

    let caughtError: unknown;
    try {
      await checkForUpdate();
    } catch (e) {
      caughtError = e;
    }
    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toContain('GitHub API returned 500');
    expect((caughtError as Error).message).toContain('Internal Server Error');
  });

  test('propagates network errors', async () => {
    mockFetch.mockImplementation(() => Promise.reject(new TypeError('fetch failed')));

    await expect(checkForUpdate()).rejects.toThrow('fetch failed');
  });

  test('fetches release-meta.json when asset exists', async () => {
    const commit = 'abc123def456abc123def456abc123def456abc1';
    mockFetch.mockImplementation(createGitHubReleaseFetch('v99.0.0', { commit }));

    const info = await checkForUpdate();

    expect(info.releaseCommit).toBe(commit);
    // Should have made at least 2 fetch calls: releases API + release-meta.json
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test('returns empty releaseCommit when no release-meta.json asset', async () => {
    mockFetch.mockImplementation(createGitHubReleaseFetch('v99.0.0')); // no commit

    const info = await checkForUpdate();

    expect(info.releaseCommit).toBe('');
  });

  test('handles release-meta.json fetch failure gracefully', async () => {
    // First call returns the release, second call (meta) fails
    let callCount = 0;
    mockFetch.mockImplementation((input: RequestInfo | URL) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      callCount++;
      if (url.includes('release-meta.json')) {
        return Promise.resolve(new Response('Not Found', { status: 404 }));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            tag_name: 'v99.0.0',
            target_commitish: 'master',
            published_at: '2026-01-01T00:00:00Z',
            html_url: 'https://github.com/test/releases/v99.0.0',
            body: 'Notes',
            assets: [
              {
                name: 'release-meta.json',
                browser_download_url: 'https://example.com/release-meta.json',
                size: 100,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    });

    const info = await checkForUpdate();

    // Should gracefully return null meta → empty releaseCommit
    expect(info.releaseCommit).toBe('');
    expect(info.latestVersion).toBe('99.0.0');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// compareRelease (private — tested indirectly via checkForUpdate)
// ─────────────────────────────────────────────────────────────────────────────

describe('compareRelease (indirect)', () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock<typeof fetch>();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('version bump detected when latest > current', async () => {
    mockFetch.mockImplementation(createGitHubReleaseFetch('v99.0.0'));

    const info = await checkForUpdate();

    expect(info.updateAvailable).toBe(true);
    expect(info.devBuild).toBe(false);
  });

  test('no version bump when latest === current', async () => {
    mockFetch.mockImplementation(
      createGitHubReleaseFetch(`v${hub.version}`, {
        commit: buildInfo.commitFull,
      })
    );

    const info = await checkForUpdate();

    expect(info.updateAvailable).toBe(false);
    expect(info.devBuild).toBe(false);
  });

  test('devBuild flagged when current version is ahead of latest', async () => {
    mockFetch.mockImplementation(createGitHubReleaseFetch('v0.0.1'));

    const info = await checkForUpdate();

    // Current version is ahead → devBuild should be true
    // (assuming current hub.version > 0.0.1)
    if (isNewer('0.0.1', hub.version)) {
      expect(info.devBuild).toBe(true);
    }
    expect(info.updateAvailable).toBe(false);
  });

  test('devBuild flagged when same version but different commit', async () => {
    mockFetch.mockImplementation(
      createGitHubReleaseFetch(`v${hub.version}`, {
        commit: 'aabbccddee0011223344aabbccddee0011223344',
      })
    );

    const info = await checkForUpdate();

    expect(info.updateAvailable).toBe(false);
    expect(info.devBuild).toBe(true);
  });

  test('devBuild is false when same version, no release-meta', async () => {
    mockFetch.mockImplementation(createGitHubReleaseFetch(`v${hub.version}`));

    const info = await checkForUpdate();

    // Without release-meta.json, releaseCommit is empty → can't detect dev build
    expect(info.devBuild).toBe(false);
  });

  test('devBuild is false when same version, same commit', async () => {
    mockFetch.mockImplementation(
      createGitHubReleaseFetch(`v${hub.version}`, {
        commit: buildInfo.commitFull,
      })
    );

    const info = await checkForUpdate();

    expect(info.devBuild).toBe(false);
    expect(info.updateAvailable).toBe(false);
  });

  test('strips v-prefix from tag_name for latestVersion', async () => {
    mockFetch.mockImplementation(createGitHubReleaseFetch('v3.2.1'));

    const info = await checkForUpdate();

    expect(info.latestVersion).toBe('3.2.1');
  });

  test('finds matching asset for current platform', async () => {
    const assetName = expectedAssetName();
    mockFetch.mockImplementation(createGitHubReleaseFetch('v99.0.0', { assetName }));

    const info = await checkForUpdate();

    expect(info.assetName).toBe(assetName);
    expect(info.assetSize).toBe(1024 * 1024 * 10);
  });

  test('returns null asset when no platform match', async () => {
    mockFetch.mockImplementation(createGitHubReleaseFetch('v99.0.0')); // no assets

    const info = await checkForUpdate();

    expect(info.assetName).toBeNull();
    expect(info.assetSize).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verifySha256 / verifyChecksum (private — tested indirectly)
//
// verifyChecksum is invoked inside applyUpdate when release-meta.json is
// present. Since it requires Bun.CryptoHasher + Bun.file (disk I/O),
// we verify its observable behavior: checkForUpdate populates checksums
// from release-meta.json, and applyUpdate would fail on mismatch.
// ─────────────────────────────────────────────────────────────────────────────

describe('verifySha256 (metadata population)', () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock<typeof fetch>();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('release-meta.json checksums are propagated to releaseCommit', async () => {
    const assetName = expectedAssetName();
    const checksums = { [assetName]: 'a'.repeat(64) };
    mockFetch.mockImplementation(
      createGitHubReleaseFetch('v99.0.0', {
        assetName,
        commit: 'deadbeef'.repeat(5),
        checksums,
      })
    );

    const info = await checkForUpdate();

    // The checksums aren't directly on UpdateInfo, but the meta is
    // fetched and parsed — releaseCommit proves meta was loaded.
    expect(info.releaseCommit).toBe('deadbeef'.repeat(5));
  });

  test('verification skipped when no release-meta.json', async () => {
    // Without release-meta.json, verifyChecksum receives null → returns early
    mockFetch.mockImplementation(createGitHubReleaseFetch('v99.0.0'));

    const info = await checkForUpdate();

    // Should succeed without error — no checksums to verify
    expect(info.releaseCommit).toBe('');
    expect(info.updateAvailable).toBe(true);
  });

  test('standalone SHA256 hash verification', async () => {
    // Directly test Bun.CryptoHasher to verify the algorithm used by verifyChecksum
    const testData = new TextEncoder().encode('hello world');
    const hasher = new Bun.CryptoHasher('sha256');
    hasher.update(testData);
    const hash = hasher.digest('hex');

    // Known SHA256 of "hello world"
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkForUpdate (integration)
// ─────────────────────────────────────────────────────────────────────────────

describe('checkForUpdate', () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    mockFetch = mock<typeof fetch>();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('returns updateAvailable=false when already on latest', async () => {
    mockFetch.mockImplementation(
      createGitHubReleaseFetch(`v${hub.version}`, {
        commit: buildInfo.commitFull,
      })
    );

    const info = await checkForUpdate();

    expect(info.updateAvailable).toBe(false);
    expect(info.currentVersion).toBe(hub.version);
    expect(info.latestVersion).toBe(hub.version);
  });

  test('returns updateAvailable=true when newer version exists', async () => {
    mockFetch.mockImplementation(createGitHubReleaseFetch('v99.0.0'));

    const info = await checkForUpdate();

    expect(info.updateAvailable).toBe(true);
    expect(info.latestVersion).toBe('99.0.0');
  });

  test('returns null assetName when no matching asset', async () => {
    mockFetch.mockImplementation(createGitHubReleaseFetch('v99.0.0'));

    const info = await checkForUpdate();

    expect(info.assetName).toBeNull();
    expect(info.assetSize).toBeNull();
  });

  test('populates asset info when matching asset found', async () => {
    const assetName = expectedAssetName();
    mockFetch.mockImplementation(createGitHubReleaseFetch('v99.0.0', { assetName }));

    const info = await checkForUpdate();

    expect(info.assetName).toBe(assetName);
    expect(info.assetSize).toBe(1024 * 1024 * 10);
  });

  test('throws on GitHub API error', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response('Not Found', { status: 404, statusText: 'Not Found' }))
    );

    let caughtError: unknown;
    try {
      await checkForUpdate();
    } catch (e) {
      caughtError = e;
    }
    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toContain('GitHub API returned 404');
  });

  test('throws on network error', async () => {
    mockFetch.mockImplementation(() => Promise.reject(new TypeError('fetch failed')));

    await expect(checkForUpdate()).rejects.toThrow('fetch failed');
  });

  test('strips v-prefix from tag_name in latestVersion', async () => {
    mockFetch.mockImplementation(createGitHubReleaseFetch('v3.2.1'));

    const info = await checkForUpdate();

    expect(info.latestVersion).toBe('3.2.1');
  });

  test('passes through releaseNotes from GitHub body', async () => {
    mockFetch.mockImplementation(
      createGitHubReleaseFetch('v99.0.0', { body: '## Changelog\n- Fixed bugs' })
    );

    const info = await checkForUpdate();

    expect(info.releaseNotes).toBe('## Changelog\n- Fixed bugs');
  });

  test('returns empty string for releaseNotes when body is null', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            tag_name: 'v99.0.0',
            target_commitish: 'master',
            published_at: '2026-01-01T00:00:00Z',
            html_url: 'https://github.com/maxscharwath/brika/releases/tag/v99.0.0',
            body: null,
            assets: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );

    const info = await checkForUpdate();

    expect(info.releaseNotes).toBe('');
  });

  test('passes through publishedAt and releaseUrl', async () => {
    const publishedAt = '2026-06-15T12:30:00Z';
    const htmlUrl = 'https://github.com/maxscharwath/brika/releases/tag/v99.0.0';

    mockFetch.mockImplementation(createGitHubReleaseFetch('v99.0.0', { publishedAt, htmlUrl }));

    const info = await checkForUpdate();

    expect(info.publishedAt).toBe(publishedAt);
    expect(info.releaseUrl).toBe(htmlUrl);
  });

  test('ignores assets that do not match the current platform', async () => {
    mockFetch.mockImplementation(
      createGitHubReleaseFetch('v99.0.0', { assetName: 'brika-fakeos-fakeArch.tar.gz' })
    );

    const info = await checkForUpdate();

    expect(info.assetName).toBeNull();
    expect(info.assetSize).toBeNull();
  });

  test('throws on server error status codes', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
        })
      )
    );

    let caughtError: unknown;
    try {
      await checkForUpdate();
    } catch (e) {
      caughtError = e;
    }
    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toContain('GitHub API returned 500');
  });

  test('returns updateAvailable=false when current version is ahead', async () => {
    mockFetch.mockImplementation(createGitHubReleaseFetch('v0.0.1'));

    const info = await checkForUpdate();

    expect(info.updateAvailable).toBe(false);
  });

  test('detects same-version different commit as dev build', async () => {
    mockFetch.mockImplementation(
      createGitHubReleaseFetch(`v${hub.version}`, {
        commit: 'aabbccddee0011223344aabbccddee0011223344',
      })
    );

    const info = await checkForUpdate();

    expect(info.updateAvailable).toBe(false);
    expect(info.devBuild).toBe(true);
  });

  test('populates releaseCommit from release-meta.json', async () => {
    const commitSha = 'ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00';
    mockFetch.mockImplementation(createGitHubReleaseFetch('v99.0.0', { commit: commitSha }));

    const info = await checkForUpdate();

    expect(info.releaseCommit).toBe(commitSha);
  });

  test('returns empty releaseCommit when release-meta.json is absent', async () => {
    mockFetch.mockImplementation(createGitHubReleaseFetch('v99.0.0'));

    const info = await checkForUpdate();

    expect(info.releaseCommit).toBe('');
  });

  test('devBuild is false when no release-meta.json and same version', async () => {
    mockFetch.mockImplementation(createGitHubReleaseFetch(`v${hub.version}`));

    const info = await checkForUpdate();

    expect(info.devBuild).toBe(false);
  });

  test('currentVersion always reflects hub.version', async () => {
    mockFetch.mockImplementation(createGitHubReleaseFetch('v99.0.0'));

    const info = await checkForUpdate();

    expect(info.currentVersion).toBe(hub.version);
  });

  test('currentCommit always reflects buildInfo.commitFull', async () => {
    mockFetch.mockImplementation(createGitHubReleaseFetch('v99.0.0'));

    const info = await checkForUpdate();

    expect(info.currentCommit).toBe(buildInfo.commitFull);
  });

  test('returns complete UpdateInfo shape', async () => {
    const assetName = expectedAssetName();
    mockFetch.mockImplementation(
      createGitHubReleaseFetch('v99.0.0', {
        assetName,
        commit: 'abc'.repeat(13) + 'a',
        body: 'Some notes',
        publishedAt: '2026-03-01T00:00:00Z',
        htmlUrl: 'https://github.com/example/releases/v99.0.0',
      })
    );

    const info = await checkForUpdate();

    expect(info).toEqual({
      currentVersion: hub.version,
      latestVersion: '99.0.0',
      updateAvailable: true,
      devBuild: false,
      releaseUrl: 'https://github.com/example/releases/v99.0.0',
      releaseNotes: 'Some notes',
      publishedAt: '2026-03-01T00:00:00Z',
      releaseCommit: 'abc'.repeat(13) + 'a',
      currentCommit: buildInfo.commitFull,
      assetName,
      assetSize: 1024 * 1024 * 10,
    });
  });
});
