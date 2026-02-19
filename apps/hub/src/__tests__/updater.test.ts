/**
 * Tests for updater utilities
 */

import { describe, expect, test } from 'bun:test';
import { useBunMock } from '@brika/testing';
import { checkForUpdate, isNewer } from '@/updater';

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
});

function mockGitHubRelease(
  bun: ReturnType<typeof useBunMock>,
  tagName: string,
  assetName?: string
) {
  const asset = assetName
    ? [
        {
          name: assetName,
          browser_download_url: `https://example.com/${assetName}`,
          size: 1024 * 1024 * 10,
        },
      ]
    : [];

  bun.fetch(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          tag_name: tagName,
          published_at: '2026-01-01T00:00:00Z',
          html_url: `https://github.com/maxscharwath/brika/releases/tag/${tagName}`,
          body: 'Release notes',
          assets: asset,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
  );
}

describe('checkForUpdate', () => {
  const bun = useBunMock();

  test('returns updateAvailable=false when already on latest', async () => {
    const { hub } = await import('@/hub');
    mockGitHubRelease(bun, `v${hub.version}`);

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

    mockGitHubRelease(bun, 'v99.0.0', assetName);

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
});
