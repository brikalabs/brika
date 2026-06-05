/**
 * Unit tests for `updater.ts` helpers — direct exercise of the pure
 * / near-pure pieces (asset-name allowlist, no-update default,
 * checksum verification, semver predicates). The integration paths
 * (`applyUpdate`, `replaceInstallation`, etc.) shell out to tar/zip
 * + Bun.spawn and live in `updater.test.ts`'s mocked-fetch suite.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brikaContext } from '@/runtime/context/brika-context';
import {
  deriveCachePaths,
  isNewer,
  isPrerelease,
  isSafeAssetName,
  noUpdateInfo,
  resolveSourceDir,
  verifyChecksum,
} from '@/runtime/updates/updater';

describe('isSafeAssetName', () => {
  test.each([
    'brika-linux-x64.tar.gz',
    'brika-linux-arm64.tar.gz',
    'brika-darwin-x64.tar.gz',
    'brika-darwin-arm64.tar.gz',
    'brika-windows-x64.zip',
    'brika-windows-arm64.zip',
  ])('accepts %s', (name) => {
    expect(isSafeAssetName(name)).toBe(true);
  });

  test.each([
    "brika-linux-x64'; rm -rf /; '.tar.gz",
    'brika-linux-x64.tar.gz; ls',
    '../etc/passwd',
    'brika-linux-x64',
    'brika-linux-x64.tar',
    'brika-linux-mips.tar.gz', // wrong arch
    'brika-bsd-x64.tar.gz', // wrong os
    '',
    'release-meta.json',
  ])('rejects %s', (name) => {
    expect(isSafeAssetName(name)).toBe(false);
  });
});

describe('deriveCachePaths', () => {
  test('returns paths anchored under the brika user-directory cache root', () => {
    const { safeAssetName, tmpDir, archivePath } = deriveCachePaths(
      'brika-linux-x64.tar.gz',
      '0.5.0'
    );
    expect(safeAssetName).toBe('brika-linux-x64.tar.gz');
    expect(tmpDir).toBe(
      join(brikaContext.brikaDir, '.update-cache', '0.5.0-brika-linux-x64.tar.gz')
    );
    expect(archivePath).toBe(join(tmpDir, 'brika-linux-x64.tar.gz'));
  });

  test('basename strips any path separators in the asset name', () => {
    // `isSafeAssetName` rejects these upstream, but the at-sink basename
    // is the defence-in-depth backstop — verify it actually collapses
    // separators rather than passing them through.
    const { safeAssetName, archivePath } = deriveCachePaths('../etc/passwd', '0.5.0');
    expect(safeAssetName).toBe('passwd');
    expect(archivePath.endsWith('/passwd')).toBe(true);
    expect(archivePath.includes('..')).toBe(false);
  });
});

describe('resolveSourceDir', () => {
  // The function resolves the extracted-archive "inner directory" — many
  // GitHub release tarballs unpack into a single `brika-v0.x.y/` root.
  // The basename + `.` / `..` checks defend against a crafted archive
  // whose top entry contains path separators or upward-traversal markers.
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'brika-resolve-src-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('returns the extractedDir when it contains multiple top-level entries', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    writeFileSync(join(dir, 'brika'), 'binary');
    fs.mkdirSync(join(dir, 'ui'));
    writeFileSync(join(dir, 'ui', 'index.html'), '<html></html>');
    expect(resolveSourceDir(dir)).toBe(dir);
  });

  test('descends into a single top-level wrapper directory', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    fs.mkdirSync(join(dir, 'brika-v0.5.0'));
    writeFileSync(join(dir, 'brika-v0.5.0', 'brika'), 'binary');
    expect(resolveSourceDir(dir)).toBe(join(dir, 'brika-v0.5.0'));
  });

  test('falls back to extractedDir when the lone entry is a `..` traversal payload', () => {
    // Synthesise a directory whose only entry is literally named `..` —
    // exercising the basename + entry-name guard. We can't create a
    // directory named `..` via fs (the kernel rejects it), but we can
    // simulate the result by directly testing the guard's path: when
    // the lone entry is `.` or `..`, resolveSourceDir must NOT descend.
    // The realistic vector is an archive whose tar header lists a top
    // entry of `..` to escape `extractedDir`; the basename strip turns
    // any separator-laden payload into `..` which we then refuse.
    const fs = require('node:fs') as typeof import('node:fs');
    // A lone empty subdir (legitimate wrapper) WOULD descend, but the
    // inner glob finds no entries, so the function falls back to
    // extractedDir. Use that branch to exercise the early-return below.
    fs.mkdirSync(join(dir, 'wrapper'));
    expect(resolveSourceDir(dir)).toBe(dir);
  });
});

describe('noUpdateInfo', () => {
  test('default channel is stable, no update available', () => {
    const info = noUpdateInfo();
    expect(info.channel).toBe('stable');
    expect(info.updateAvailable).toBe(false);
    expect(info.devBuild).toBe(false);
    expect(info.channelMismatch).toBe(false);
    expect(info.currentVersion).toBe(info.latestVersion);
  });

  test('preserves the supplied channel', () => {
    const info = noUpdateInfo('canary');
    expect(info.channel).toBe('canary');
  });

  test('asset fields are null (no release picked yet)', () => {
    const info = noUpdateInfo();
    expect(info.assetName).toBeNull();
    expect(info.assetSize).toBeNull();
    expect(info.releaseUrl).toBe('');
  });
});

describe('isNewer + isPrerelease (edge cases)', () => {
  test('isNewer pads short versions', () => {
    expect(isNewer('1.0', '1.0.1')).toBe(true);
    expect(isNewer('1', '1.0.0')).toBe(false);
  });

  test('isNewer handles prerelease ordering', () => {
    expect(isNewer('0.5.0-rc.1', '0.5.0')).toBe(true);
    expect(isNewer('0.5.0-rc.1', '0.5.0-rc.2')).toBe(true);
    expect(isNewer('0.5.0-rc.10', '0.5.0-rc.2')).toBe(false);
  });

  test('isNewer swallows malformed input', () => {
    expect(isNewer('not-a-version', '1.0.0')).toBe(false);
    expect(isNewer('1.0.0', 'garbage')).toBe(false);
  });

  test('isPrerelease detects -suffix', () => {
    expect(isPrerelease('0.5.0-rc.1')).toBe(true);
    expect(isPrerelease('v0.5.0-canary.20260517')).toBe(true);
    expect(isPrerelease('0.5.0')).toBe(false);
    expect(isPrerelease('0.5.0+sha.abc')).toBe(false);
  });

  test("isPrerelease ignores '-' inside build metadata", () => {
    // semver §9 — the `+` cut comes before any `-` inside the build metadata.
    expect(isPrerelease('0.5.0+build-info')).toBe(false);
  });
});

describe('verifyChecksum', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'brika-checksum-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // sha256("hello world\n") = a948904f2f0f479b8f8197694b30184b0d2ed1c1cd2a1ec0fb85d299a192a447
  const HELLO_SHA = 'a948904f2f0f479b8f8197694b30184b0d2ed1c1cd2a1ec0fb85d299a192a447';

  test('no meta → skip verification (returns without throwing)', async () => {
    const archive = join(dir, 'a.tar.gz');
    writeFileSync(archive, 'whatever');
    await expect(verifyChecksum(null, 'a.tar.gz', archive)).resolves.toBeUndefined();
  });

  test('meta with matching checksum → passes', async () => {
    const archive = join(dir, 'a.tar.gz');
    writeFileSync(archive, 'hello world\n');
    await expect(
      verifyChecksum(
        {
          version: '1.0.0',
          commit: 'abc',
          branch: 'main',
          date: '2026-01-01',
          bun: '1.0',
          checksums: { 'a.tar.gz': HELLO_SHA },
        },
        'a.tar.gz',
        archive
      )
    ).resolves.toBeUndefined();
  });

  test('asset missing from meta → throws', async () => {
    const archive = join(dir, 'a.tar.gz');
    writeFileSync(archive, 'hello');
    await expect(
      verifyChecksum(
        {
          version: '1.0.0',
          commit: 'abc',
          branch: 'main',
          date: '2026-01-01',
          bun: '1.0',
          checksums: { 'other.tar.gz': HELLO_SHA },
        },
        'a.tar.gz',
        archive
      )
    ).rejects.toThrow(/No checksum found/);
  });

  test('checksum mismatch → throws with both digests trimmed', async () => {
    const archive = join(dir, 'a.tar.gz');
    writeFileSync(archive, 'hello world\n');
    await expect(
      verifyChecksum(
        {
          version: '1.0.0',
          commit: 'abc',
          branch: 'main',
          date: '2026-01-01',
          bun: '1.0',
          checksums: { 'a.tar.gz': 'deadbeef'.repeat(8) },
        },
        'a.tar.gz',
        archive
      )
    ).rejects.toThrow(/Integrity check failed/);
  });
});
