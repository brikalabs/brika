/**
 * BRIKA Self-Updater
 *
 * Checks GitHub Releases for the latest version and performs an in-place update.
 * Works on all platforms: Linux, macOS (Intel/ARM), Windows.
 *
 * Features:
 * - Semver + commit hash comparison (detects same-version rebuilds)
 * - SHA256 integrity verification of downloaded archives
 * - Progress streaming for UI integration
 *
 * Used by:
 * - CLI: `brika update` (interactive with progress output)
 * - API: `/api/system/update` routes (programmatic, used by the UI)
 * - Background: UpdateService checks periodically on startup
 */

import { chmod, cp, mkdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import pc from 'picocolors';
import { CliError } from '@/errors';
import { HUB_GITHUB_RELEASES_API, HUB_GITHUB_RELEASES_LIST_API, hub } from '@/hub';
import { buildInfo } from '@/runtime/http/routes/status';
import {
  DEFAULT_CHANNEL_ID,
  resolveChannel,
  type UpdateChannelId,
} from '@/runtime/updates/channels';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GitHubRelease {
  tag_name: string;
  target_commitish: string;
  published_at: string;
  html_url: string;
  body: string;
  prerelease: boolean;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

/** Metadata embedded as a release asset — provides build info + per-platform checksums */
interface ReleaseMeta {
  version: string;
  commit: string;
  branch: string;
  date: string;
  bun: string;
  checksums: Record<string, string>;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  /** True when current version is ahead of the latest release (dev/unreleased build). */
  devBuild: boolean;
  /**
   * True when the local hub is on a *pre-release* tag (e.g. `0.5.0-rc.1`)
   * and the selected channel reports an *older* version (e.g. stable's
   * `0.4.0`). Without this signal the UI would treat it as a generic dev
   * build, even though the real story is "you switched canary → stable
   * and there's nothing newer for you on this channel".
   */
  channelMismatch: boolean;
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: string;
  releaseCommit: string;
  currentCommit: string;
  assetName: string | null;
  assetSize: number | null;
  channel: UpdateChannelId;
}

export type UpdatePhase =
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'extracting'
  | 'installing'
  | 'restarting'
  | 'complete'
  | 'error';

/** Returns a safe default UpdateInfo when no check has succeeded yet. */
export function noUpdateInfo(channel: UpdateChannelId = DEFAULT_CHANNEL_ID): UpdateInfo {
  return {
    currentVersion: hub.version,
    latestVersion: hub.version,
    updateAvailable: false,
    devBuild: false,
    channelMismatch: false,
    releaseUrl: '',
    releaseNotes: '',
    publishedAt: '',
    releaseCommit: '',
    currentCommit: buildInfo.commitFull,
    assetName: null,
    assetSize: null,
    channel,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core utilities (shared between CLI and API)
// ─────────────────────────────────────────────────────────────────────────────

/** Get the platform-specific asset name */
function getAssetName(): string {
  const os = process.platform === 'win32' ? 'windows' : process.platform;
  const arch = process.arch;
  const ext = process.platform === 'win32' ? '.zip' : '.tar.gz';
  return `brika-${os}-${arch}${ext}`;
}

/**
 * Normalize a version string so `Bun.semver.order` returns sensible results.
 *
 * - Strips a leading `v`.
 * - Pads missing major/minor/patch segments with `0` (so `"1.0"` and `"1"`
 *   resolve to `"1.0.0"`). Bun.semver is *inconsistent* on short forms —
 *   `order("1.0", "1.0.0")` returns `1`, which is surprising — padding
 *   sidesteps that.
 * - Truncates extra segments (`1.0.0.0` → `1.0.0`). 4-segment versions
 *   aren't semver-2.0; nothing in production emits them.
 * - Pre-release / build-metadata suffix (`-rc.1`, `+sha.abc`) is preserved
 *   verbatim and re-attached after padding.
 */
function normalizeVersion(version: string): string {
  const stripped = version.replace(/^v/, '');
  const suffixStart = stripped.search(/[-+]/);
  const base = suffixStart === -1 ? stripped : stripped.slice(0, suffixStart);
  const suffix = suffixStart === -1 ? '' : stripped.slice(suffixStart);
  const parts = base.split('.').slice(0, 3);
  while (parts.length < 3) {
    parts.push('0');
  }
  return `${parts.join('.')}${suffix}`;
}

/**
 * Return true if `latest` is strictly newer than `current` per semver-2.0,
 * including pre-release tag ordering (`0.4.0-rc.1` < `0.4.0`, `rc.2` < `rc.10`).
 *
 * Backed by `Bun.semver.order` so we get the full spec for free instead of
 * the dot-split-numeric-compare we shipped originally, which mishandled
 * every canary tag (`Number('0-rc')` → `NaN`, all comparisons false).
 *
 * Invalid versions resolve to `false` rather than throwing — a corrupted
 * `package.json` or a malformed GitHub tag should NOT trigger an in-place
 * binary swap.
 */
export function isNewer(current: string, latest: string): boolean {
  try {
    return Bun.semver.order(normalizeVersion(latest), normalizeVersion(current)) === 1;
  } catch {
    return false;
  }
}

/**
 * Heuristic: is this semver string a pre-release build (e.g. `0.4.0-rc.1`,
 * `0.4.0-canary.20260517`)? Pre-release identifier is everything after the
 * first `-` and before the optional `+` build metadata, per semver-2.0 §9.
 *
 * Used to distinguish "actually a local dev build" from "user just switched
 * canary → stable and the channel is now reporting an older tag" — the
 * latter is the channelMismatch case.
 */
export function isPrerelease(version: string): boolean {
  const stripped = version.replace(/^v/, '');
  const dash = stripped.indexOf('-');
  if (dash === -1) {
    return false;
  }
  const plus = stripped.indexOf('+');
  return plus === -1 || dash < plus;
}

/** Fetch release-meta.json asset from a GitHub release (commit SHA + checksums) */
async function fetchReleaseMeta(release: GitHubRelease): Promise<ReleaseMeta | null> {
  try {
    const metaAsset = release.assets.find((a) => a.name === 'release-meta.json');
    if (!metaAsset) {
      return null;
    }

    const response = await fetch(metaAsset.browser_download_url);
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as ReleaseMeta;
  } catch {
    return null;
  }
}

/** Fetch latest release info from GitHub API for the given channel */
async function fetchLatestRelease(
  channel: UpdateChannelId
): Promise<{ release: GitHubRelease; meta: ReleaseMeta | null }> {
  if (channel === 'stable') {
    const response = await fetch(HUB_GITHUB_RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
    }
    const release = (await response.json()) as GitHubRelease;
    return { release, meta: await fetchReleaseMeta(release) };
  }

  // canary: list releases, pick the most recent pre-release
  const response = await fetch(`${HUB_GITHUB_RELEASES_LIST_API}?per_page=10`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
  }
  const releases = (await response.json()) as GitHubRelease[];
  const prerelease = releases.find((r) => r.prerelease);
  if (!prerelease) {
    throw new Error('No canary release found');
  }
  return { release: prerelease, meta: await fetchReleaseMeta(prerelease) };
}

interface ReleaseComparison {
  latestVersion: string;
  releaseCommit: string;
  versionBump: boolean;
  devBuild: boolean;
  /**
   * Local hub is on a pre-release tag and the *stable* channel reports a
   * lower version. Distinguishes "user switched canary→stable" from a
   * genuine local dev build.
   */
  channelMismatch: boolean;
  asset: GitHubRelease['assets'][number] | undefined;
  release: GitHubRelease;
  meta: ReleaseMeta | null;
}

/** Compare current build against a fetched release on the given channel. */
function compareRelease(
  release: GitHubRelease,
  meta: ReleaseMeta | null,
  channel: UpdateChannelId
): ReleaseComparison {
  const currentVersion = hub.version;
  const currentCommit = buildInfo.commitFull;
  const latestVersion = release.tag_name.replace(/^v/, '');
  const releaseCommit = meta?.commit ?? '';
  const assetName = getAssetName();

  const versionBump = isNewer(currentVersion, latestVersion);
  const versionAhead = isNewer(latestVersion, currentVersion);
  const sameVersionDifferentCommit =
    !versionBump &&
    !versionAhead &&
    currentVersion === latestVersion &&
    currentCommit !== 'unknown' &&
    releaseCommit !== '' &&
    currentCommit !== releaseCommit;

  const channelMismatch = channel === 'stable' && versionAhead && isPrerelease(currentVersion);

  return {
    latestVersion,
    releaseCommit,
    versionBump,
    // A channel mismatch is not a "dev build" — peel it out so the UI can
    // explain the situation accurately instead of pointing at the local
    // tree when the truth is "switch back to canary".
    devBuild: !channelMismatch && (versionAhead || sameVersionDifferentCommit),
    channelMismatch,
    asset: release.assets.find((a) => a.name === assetName),
    release,
    meta,
  };
}

/**
 * Check for updates without applying them.
 * Safe to call from background tasks or API.
 */
export async function checkForUpdate(
  channel: UpdateChannelId = DEFAULT_CHANNEL_ID
): Promise<UpdateInfo> {
  const { release, meta } = await fetchLatestRelease(channel);
  const cmp = compareRelease(release, meta, channel);

  return {
    currentVersion: hub.version,
    latestVersion: cmp.latestVersion,
    updateAvailable: cmp.versionBump,
    devBuild: cmp.devBuild,
    channelMismatch: cmp.channelMismatch,
    releaseUrl: release.html_url,
    releaseNotes: release.body ?? '',
    publishedAt: release.published_at,
    releaseCommit: cmp.releaseCommit,
    currentCommit: buildInfo.commitFull,
    assetName: cmp.asset?.name ?? null,
    assetSize: cmp.asset?.size ?? null,
    channel,
  };
}

export interface ApplyUpdateOptions {
  force?: boolean;
  channel?: UpdateChannelId;
  onProgress?: (phase: UpdatePhase, detail: string) => void;
}

/**
 * Download and apply update. Returns the new version string.
 * Used by both CLI and API.
 *
 * When `force` is true, reinstalls even if already on the latest version.
 */
export async function applyUpdate(options?: ApplyUpdateOptions): Promise<{
  previousVersion: string;
  previousCommit: string;
  newVersion: string;
  newCommit: string;
}> {
  const { force, channel = DEFAULT_CHANNEL_ID, onProgress } = options ?? {};

  onProgress?.('checking', 'Checking for updates...');
  const { release, meta } = await fetchLatestRelease(channel);
  const cmp = compareRelease(release, meta, channel);

  if (!force && !cmp.versionBump && !cmp.devBuild) {
    throw new Error(`Already up to date (v${hub.version})`);
  }

  const { asset } = cmp;
  if (!asset) {
    throw new Error(`No binary available for ${process.platform}/${process.arch}`);
  }

  // Download
  const tmpDir = join(tmpdir(), `brika-update-${Date.now()}`);
  await mkdir(tmpDir, {
    recursive: true,
  });
  const archivePath = join(tmpDir, asset.name);

  try {
    await downloadFile(asset.browser_download_url, archivePath, asset.size, (pct) => {
      onProgress?.('downloading', `Downloading v${cmp.latestVersion}... ${pct}%`);
    });

    // Verify SHA256 integrity
    if (cmp.meta) {
      onProgress?.('verifying', 'Verifying integrity...');
      await verifyChecksum(cmp.meta, asset.name, archivePath);
    } else {
      onProgress?.('verifying', 'Skipping integrity check — no release metadata available');
    }

    // Extract
    onProgress?.('extracting', 'Extracting...');
    const extractDir = join(tmpDir, 'extracted');
    await mkdir(extractDir, {
      recursive: true,
    });

    if (asset.name.endsWith('.zip')) {
      await extractZip(archivePath, extractDir);
    } else {
      await extractTarGz(archivePath, extractDir);
    }

    // Replace
    onProgress?.('installing', 'Installing...');
    const installDir = dirname(process.execPath);
    await replaceInstallation(extractDir, installDir);

    onProgress?.('complete', `Updated to v${cmp.latestVersion}`);

    return {
      previousVersion: hub.version,
      previousCommit: buildInfo.commit,
      newVersion: cmp.latestVersion,
      newCommit: cmp.meta?.commit.slice(0, 7) ?? '',
    };
  } finally {
    try {
      await rm(tmpDir, {
        recursive: true,
        force: true,
      });
    } catch {
      // Non-critical
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SHA256 verification
// ─────────────────────────────────────────────────────────────────────────────

/** Verify downloaded archive against release-meta.json checksums */
async function verifyChecksum(
  meta: ReleaseMeta | null,
  assetName: string,
  archivePath: string
): Promise<void> {
  if (!meta) {
    return; // No metadata — skip verification (pre-meta releases)
  }

  const expectedHash = meta.checksums[assetName];
  if (!expectedHash) {
    throw new Error(`No checksum found for ${assetName} in release-meta.json`);
  }

  const hasher = new Bun.CryptoHasher('sha256');
  const buffer = await Bun.file(archivePath).arrayBuffer();
  hasher.update(buffer);
  const actualHash = hasher.digest('hex');

  if (actualHash !== expectedHash) {
    throw new Error(
      `Integrity check failed for ${assetName}: expected ${expectedHash.slice(0, 12)}..., got ${actualHash.slice(0, 12)}...`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// File operations
// ─────────────────────────────────────────────────────────────────────────────

async function downloadFile(
  url: string,
  destPath: string,
  totalBytes: number,
  onProgress?: (pct: number) => void
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  if (!onProgress || !response.body || totalBytes <= 0) {
    await Bun.write(destPath, response);
    return;
  }

  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let downloaded = 0;
  let lastPct = -1;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    downloaded += value.byteLength;
    const pct = Math.round((downloaded / totalBytes) * 100);
    if (pct !== lastPct) {
      lastPct = pct;
      onProgress(pct);
    }
  }

  await Bun.write(destPath, new Blob(chunks));
}

async function extractTarGz(archivePath: string, destDir: string): Promise<void> {
  const proc = Bun.spawn(['tar', 'xzf', archivePath, '-C', destDir], {
    stdout: 'ignore',
    stderr: 'pipe',
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`tar extraction failed (exit ${exitCode}): ${stderr}`);
  }
}

async function extractZip(archivePath: string, destDir: string): Promise<void> {
  const proc = Bun.spawn(
    [
      'powershell',
      '-Command',
      `Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force`,
    ],
    {
      stdout: 'ignore',
      stderr: 'pipe',
    }
  );

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`zip extraction failed (exit ${exitCode}): ${stderr}`);
  }
}

async function replaceInstallation(extractedDir: string, installDir: string): Promise<void> {
  const sourceDir = resolveSourceDir(extractedDir);
  const isWindows = process.platform === 'win32';
  const ext = isWindows ? '.exe' : '';

  await replaceBinary(join(sourceDir, `brika${ext}`), process.execPath, isWindows);

  await replaceDir(join(sourceDir, 'ui'), join(installDir, 'ui'));
}

/**
 * Some archives extract into a single root directory (e.g. brika-v0.2.0/).
 * Detect that and return the inner directory so callers can treat either
 * layout the same way.
 */
function resolveSourceDir(extractedDir: string): string {
  const entries = [
    ...new Bun.Glob('*').scanSync({
      cwd: extractedDir,
      onlyFiles: false,
    }),
  ];
  if (entries.length !== 1) {
    return extractedDir;
  }

  const subDir = join(extractedDir, entries[0] ?? '');
  try {
    const subEntries = [
      ...new Bun.Glob('*').scanSync({
        cwd: subDir,
        onlyFiles: false,
      }),
    ];
    return subEntries.length > 0 ? subDir : extractedDir;
  } catch {
    return extractedDir;
  }
}

async function replaceBinary(
  newPath: string,
  currentPath: string,
  isWindows: boolean
): Promise<void> {
  if (!(await Bun.file(newPath).exists())) {
    return;
  }

  const backupPath = `${currentPath}.${isWindows ? 'old' : 'bak'}`;
  await rm(backupPath, {
    force: true,
  }).catch(() => undefined);

  if (isWindows) {
    // On Windows, running executables are locked — use shell move
    const proc = Bun.spawn(['cmd', '/c', 'move', '/Y', currentPath, backupPath], {
      stdout: 'ignore',
      stderr: 'ignore',
    });
    await proc.exited;
  } else {
    await rename(currentPath, backupPath);
  }

  await Bun.write(currentPath, Bun.file(newPath));
  if (!isWindows) {
    await chmod(currentPath, 0o755);
  }

  await rm(backupPath, {
    force: true,
  }).catch(() => undefined);
}

async function replaceDir(newDir: string, currentDir: string): Promise<void> {
  let hasEntries: boolean;
  try {
    hasEntries =
      [
        ...new Bun.Glob('*').scanSync({
          cwd: newDir,
          onlyFiles: false,
        }),
      ].length > 0;
  } catch {
    return; // source dir doesn't exist
  }
  if (!hasEntries) {
    return;
  }

  await rm(currentDir, {
    recursive: true,
    force: true,
  });
  await cp(newDir, currentDir, {
    recursive: true,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point (interactive with terminal output)
// ─────────────────────────────────────────────────────────────────────────────

/** Read the persisted update channel from state.json without the DI container */
async function readChannelFromState(): Promise<UpdateChannelId> {
  const home = process.env.BRIKA_HOME ?? join(process.cwd(), '.brika');
  try {
    const file = Bun.file(`${home}/state.json`);
    if (!(await file.exists())) {
      return DEFAULT_CHANNEL_ID;
    }
    const parsed = JSON.parse(await file.text()) as { updateChannel?: string };
    return resolveChannel(parsed.updateChannel).id;
  } catch {
    return DEFAULT_CHANNEL_ID;
  }
}

export async function selfUpdate(options?: {
  force?: boolean;
  channel?: UpdateChannelId;
}): Promise<void> {
  const currentCommitLabel = pc.dim(`(${buildInfo.commit})`);
  const versionLabel = pc.dim(`v${hub.version}`);
  console.log(`${pc.cyan('brika')} ${versionLabel} ${currentCommitLabel}`);
  console.log();

  const channel = options?.channel ?? (await readChannelFromState());

  try {
    const result = await applyUpdate({
      force: options?.force,
      channel,
      onProgress(phase, detail) {
        if (phase !== 'complete') {
          console.log(`  ${pc.dim(detail)}`);
        }
      },
    });

    // Regenerate completions with the new binary (it's already on disk)
    try {
      const proc = Bun.spawn([process.execPath, 'completions'], {
        stdout: 'ignore',
        stderr: 'ignore',
      });
      await proc.exited;
    } catch {
      // Non-critical
    }

    const prev = `v${result.previousVersion} (${result.previousCommit})`;
    const newCommitLabel = result.newCommit ? ` (${result.newCommit})` : '';
    const next = pc.bold(`v${result.newVersion}${newCommitLabel}`);
    console.log();
    console.log(`  ${pc.green('Updated successfully!')} ${prev} → ${next}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Already up to date')) {
      console.log(`  ${pc.green(msg)}`);
    } else {
      throw new CliError(`  ${pc.red('Update failed:')} ${msg}`);
    }
  }
}
