/**
 * Direct tests for `maybeVerifySignature` — the helper applied
 * between `verifyChecksum` and archive extraction in `applyUpdate`.
 *
 * Three observable outcomes:
 *   - no .minisig + no embedded pubkey → silent skip   (pre-ceremony builds only)
 *   - no .minisig + embedded pubkey    → throw         (refuse unsigned)
 *   - .minisig present                 → download + verify; throw on mismatch
 *
 * The embedded-pubkey constant in `signature.ts` is populated in this
 * build, so we exercise the "refuse unsigned" and "verify fails on
 * gibberish sig" branches here. The "no embedded pubkey" branch is
 * covered by `signature.test.ts` against the verifier directly.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realFetch } from '@brika/testing';
import { type GitHubRelease, maybeVerifySignature } from '@/runtime/updates/updater';

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
  test('refuses an unsigned update when the pubkey is embedded', async () => {
    // Release ships only the binary, no .minisig. With a real pubkey
    // baked in, accepting this would silently downgrade trust — the
    // updater throws instead.
    const release = makeRelease({
      assets: [{ name: 'brika-linux-x64.tar.gz', browser_download_url: 'https://x/a', size: 1 }],
    });
    const archive = join(dir, 'archive.tar.gz');
    writeFileSync(archive, 'whatever');

    const [firstAsset] = release.assets;
    if (!firstAsset) {
      throw new Error('test fixture missing primary asset');
    }
    await expect(
      maybeVerifySignature(release, firstAsset, archive, dir, () => undefined)
    ).rejects.toThrow(/no .minisig asset was published/);
  });

  test('downloads the .minisig and throws when verification fails', async () => {
    // Release ships both archive + .minisig but the sig is gibberish
    // — the parser rejects the line lengths and the helper turns the
    // verifier's "failed" result into a thrown error.
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

    const mockFetch: ReturnType<typeof mock> = mock<typeof fetch>();
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response('untrusted comment: x\nAAAA\ntrusted comment: y\nBBBB\n', { status: 200 })
      )
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const [firstAsset] = release.assets;
    if (!firstAsset) {
      throw new Error('test fixture missing primary asset');
    }
    await expect(
      maybeVerifySignature(release, firstAsset, archive, dir, () => undefined)
    ).rejects.toThrow(/Signature verification failed/);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
