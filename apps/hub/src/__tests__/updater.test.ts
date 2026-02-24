/**
 * Tests for updater utilities
 */

import { describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import { buildInfo } from '@/runtime/http/routes/status';
import type { UpdateInfo } from '@/updater';
import { checkForUpdate, isNewer, noUpdateInfo } from '@/updater';

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
  test('returns correct shape with no update available', async () => {
    const { hub } = await import('@/hub');
    const info = noUpdateInfo();

    expect(info).toMatchObject({
      currentVersion: hub.version,
      latestVersion: hub.version,
      updateAvailable: false,
      releaseUrl: '',
      releaseNotes: '',
      publishedAt: '',
      assetName: null,
      assetSize: null,
    });
  });

  test('uses the actual hub version as both current and latest', async () => {
    const { hub } = await import('@/hub');
    const info = noUpdateInfo();

    expect(info.currentVersion).toBe(hub.version);
    expect(info.latestVersion).toBe(hub.version);
  });

  test('returns a fresh object each call', () => {
    const a = noUpdateInfo();
    const b = noUpdateInfo();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkForUpdate
// ─────────────────────────────────────────────────────────────────────────────

function mockGitHubRelease(
  bun: ReturnType<typeof useBunMock>,
  tagName: string,
  options?: {
    assetName?: string;
    body?: string;
    publishedAt?: string;
    htmlUrl?: string;
    commit?: string;
  }
) {
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
    body: options?.body ?? 'Release notes',
    assets,
  });

  const metaJson = commit
    ? JSON.stringify({
        version: tagName.replace(/^v/, ''),
        commit,
        branch: 'master',
        date: '2026-01-01T00:00:00Z',
        bun: '1.3.9',
        checksums: {},
      })
    : null;

  bun.fetch((input) => {
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
  });
}

describe('checkForUpdate', () => {
  const bun = useBunMock();

  test('returns updateAvailable=false when already on latest', async () => {
    const { hub } = await import('@/hub');
    mockGitHubRelease(bun, `v${hub.version}`, {
      commit: buildInfo.commitFull,
    });

    const info = await checkForUpdate();

    expect(info.updateAvailable).toBe(false);
    expect(info.currentVersion).toBe(hub.version);
    expect(info.latestVersion).toBe(hub.version);
  });

  test('returns updateAvailable=true when newer version exists', async () => {
    mockGitHubRelease(bun, 'v99.0.0');

    const info = await checkForUpdate();

    expect(info.updateAvailable).toBe(true);
    expect(info.latestVersion).toBe('99.0.0');
  });

  test('returns null assetName when no matching asset', async () => {
    mockGitHubRelease(bun, 'v99.0.0'); // no assets

    const info = await checkForUpdate();

    expect(info.assetName).toBeNull();
    expect(info.assetSize).toBeNull();
  });

  test('populates asset info when matching asset found', async () => {
    const os = process.platform === 'win32' ? 'windows' : process.platform;
    const ext = process.platform === 'win32' ? '.zip' : '.tar.gz';
    const assetName = `brika-${os}-${process.arch}${ext}`;

    mockGitHubRelease(bun, 'v99.0.0', { assetName });

    const info = await checkForUpdate();

    expect(info.assetName).toBe(assetName);
    expect(info.assetSize).toBe(1024 * 1024 * 10);
  });

  test('throws on GitHub API error', async () => {
    bun.fetch(() =>
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
    bun.fetch(() => Promise.reject(new TypeError('fetch failed')));

    await expect(checkForUpdate()).rejects.toThrow('fetch failed');
  });

  test('strips v-prefix from tag_name in latestVersion', async () => {
    mockGitHubRelease(bun, 'v3.2.1');

    const info = await checkForUpdate();

    expect(info.latestVersion).toBe('3.2.1');
  });

  test('passes through releaseNotes from GitHub body', async () => {
    mockGitHubRelease(bun, 'v99.0.0', { body: '## Changelog\n- Fixed bugs' });

    const info = await checkForUpdate();

    expect(info.releaseNotes).toBe('## Changelog\n- Fixed bugs');
  });

  test('returns empty string for releaseNotes when body is null', async () => {
    bun.fetch(() =>
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

    mockGitHubRelease(bun, 'v99.0.0', { publishedAt, htmlUrl });

    const info = await checkForUpdate();

    expect(info.publishedAt).toBe(publishedAt);
    expect(info.releaseUrl).toBe(htmlUrl);
  });

  test('ignores assets that do not match the current platform', async () => {
    // Use a fake asset name that doesn't match any real platform
    mockGitHubRelease(bun, 'v99.0.0', { assetName: 'brika-fakeos-fakeArch.tar.gz' });

    const info = await checkForUpdate();

    expect(info.assetName).toBeNull();
    expect(info.assetSize).toBeNull();
  });

  test('throws on server error status codes', async () => {
    bun.fetch(() =>
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
    mockGitHubRelease(bun, 'v0.0.1');

    const info = await checkForUpdate();

    // The current hub version should be >= 0.0.1 in any realistic scenario
    // Even though commits differ, since current is ahead, no update
    expect(info.updateAvailable).toBe(false);
  });

  test('detects same-version different commit as dev build', async () => {
    const { hub } = await import('@/hub');
    mockGitHubRelease(bun, `v${hub.version}`, {
      commit: 'aabbccddee0011223344aabbccddee0011223344',
    });

    const info = await checkForUpdate();

    expect(info.updateAvailable).toBe(false);
    expect(info.devBuild).toBe(true);
  });

  test('populates releaseCommit from release-meta.json', async () => {
    const commitSha = 'ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00';
    mockGitHubRelease(bun, 'v99.0.0', { commit: commitSha });

    const info = await checkForUpdate();

    expect(info.releaseCommit).toBe(commitSha);
  });

  test('returns empty releaseCommit when release-meta.json is absent', async () => {
    mockGitHubRelease(bun, 'v99.0.0'); // no commit option → no release-meta.json

    const info = await checkForUpdate();

    expect(info.releaseCommit).toBe('');
  });

  test('devBuild is false when no release-meta.json and same version', async () => {
    const { hub } = await import('@/hub');
    mockGitHubRelease(bun, `v${hub.version}`); // no commit → no meta

    const info = await checkForUpdate();

    // Without release-meta.json, can't compare commits — not flagged as dev build
    expect(info.devBuild).toBe(false);
  });
});
