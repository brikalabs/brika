/**
 * Direct tests for `maybeVerifySignature` — the helper applied
 * between `verifyChecksum` and archive extraction in `applyUpdate`.
 *
 * Three observable outcomes:
 *   - no .minisig + no embedded pubkey → silent skip
 *   - no .minisig + embedded pubkey    → throw (refuse unsigned)
 *   - .minisig present                 → download + verify; throw on mismatch
 *
 * The embedded-pubkey constant lives in `signature.ts` and is empty
 * in this build, so we can only verify branch (1) and a "no pubkey →
 * sig present but skipped" outcome here. Branch (2) is sketched as
 * a constant-flip TODO so future contributors notice if they ever
 * populate the key.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realFetch } from '@brika/testing';
import { type GitHubRelease, maybeVerifySignature } from '@/updater';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'brika-sig-helper-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  globalThis.fetch = realFetch;
});

function makeRelease(extra: Partial<GitHubRelease> = {}): GitHubRelease {
  return {
    tag_name: 'v0.6.0',
    target_commitish: 'main',
    published_at: '2026-01-01T00:00:00Z',
    html_url: 'https://github.com/x/y/releases/tag/v0.6.0',
    body: 'notes',
    prerelease: false,
    assets: [],
    ...extra,
  };
}

describe('maybeVerifySignature', () => {
  test('silently skips when no .minisig asset and no embedded pubkey', async () => {
    const release = makeRelease({
      assets: [{ name: 'brika-linux-x64.tar.gz', browser_download_url: 'https://x/a', size: 1 }],
    });
    const archive = join(dir, 'archive.tar.gz');
    writeFileSync(archive, 'whatever');

    const progress: Array<[string, string]> = [];
    const [firstAsset] = release.assets;
    if (!firstAsset) {
      throw new Error('test fixture missing primary asset');
    }
    await expect(
      maybeVerifySignature(release, firstAsset, archive, dir, (phase, detail) =>
        progress.push([phase, detail])
      )
    ).resolves.toBeUndefined();

    expect(progress.some(([, msg]) => /skipped/i.test(msg))).toBe(true);
  });

  test('downloads + reports skipped when a .minisig is published but no pubkey is embedded', async () => {
    // Pubkey is empty in this build → verifier returns `'skipped'`
    // even with a valid-looking sig file. The path still exercises
    // the download branch.
    const release = makeRelease({
      assets: [
        { name: 'brika-linux-x64.tar.gz', browser_download_url: 'https://x/a', size: 1 },
        {
          name: 'brika-linux-x64.tar.gz.minisig',
          browser_download_url: 'https://x/a.minisig',
          size: 256,
        },
      ],
    });
    const archive = join(dir, 'archive.tar.gz');
    writeFileSync(archive, 'whatever');

    // Mock fetch to serve a placeholder sig body.
    const mockFetch: ReturnType<typeof mock> = mock<typeof fetch>();
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response('untrusted comment: x\nAAAA\ntrusted comment: y\nBBBB\n', { status: 200 })
      )
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const progress: Array<[string, string]> = [];
    const [firstAsset] = release.assets;
    if (!firstAsset) {
      throw new Error('test fixture missing primary asset');
    }
    await expect(
      maybeVerifySignature(release, firstAsset, archive, dir, (phase, detail) =>
        progress.push([phase, detail])
      )
    ).resolves.toBeUndefined();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(progress.some(([, msg]) => /skipped/i.test(msg))).toBe(true);
  });
});
