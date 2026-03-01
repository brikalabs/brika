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
import { CliError } from '@/cli/errors';
import { HUB_GITHUB_RELEASES_API, hub } from '@/hub';
import { buildInfo } from '@/runtime/http/routes/status';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GitHubRelease {
  tag_name: string;
  target_commitish: string;
  published_at: string;
  html_url: string;
  body: string;
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
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: string;
  releaseCommit: string;
  currentCommit: string;
  assetName: string | null;
  assetSize: number | null;
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
export function noUpdateInfo(): UpdateInfo {
  return {
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

/** Parse a version string like "v0.2.1" or "0.2.1" into comparable parts */
function parseVersion(version: string): number[] {
  return version.replace(/^v/, '').split('.').map(Number);
}

/** Return true if `latest` is newer than `current` */
export function isNewer(current: string, latest: string): boolean {
  const a = parseVersion(current);
  const b = parseVersion(latest);

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (bv > av) {
      return true;
    }
    if (bv < av) {
      return false;
    }
  }
  return false;
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

/** Fetch latest release info from GitHub API */
async function fetchLatestRelease(): Promise<{
  release: GitHubRelease;
  meta: ReleaseMeta | null;
}> {
  const response = await fetch(HUB_GITHUB_RELEASES_API, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
  }

  const release = (await response.json()) as GitHubRelease;
  const meta = await fetchReleaseMeta(release);

  return {
    release,
    meta,
  };
}

interface ReleaseComparison {
  latestVersion: string;
  releaseCommit: string;
  versionBump: boolean;
  devBuild: boolean;
  asset: GitHubRelease['assets'][number] | undefined;
  release: GitHubRelease;
  meta: ReleaseMeta | null;
}

/** Compare current build against a fetched release */
function compareRelease(release: GitHubRelease, meta: ReleaseMeta | null): ReleaseComparison {
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

  return {
    latestVersion,
    releaseCommit,
    versionBump,
    devBuild: versionAhead || sameVersionDifferentCommit,
    asset: release.assets.find((a) => a.name === assetName),
    release,
    meta,
  };
}

/**
 * Check for updates without applying them.
 * Safe to call from background tasks or API.
 */
export async function checkForUpdate(): Promise<UpdateInfo> {
  const { release, meta } = await fetchLatestRelease();
  const cmp = compareRelease(release, meta);

  return {
    currentVersion: hub.version,
    latestVersion: cmp.latestVersion,
    updateAvailable: cmp.versionBump,
    devBuild: cmp.devBuild,
    releaseUrl: release.html_url,
    releaseNotes: release.body ?? '',
    publishedAt: release.published_at,
    releaseCommit: cmp.releaseCommit,
    currentCommit: buildInfo.commitFull,
    assetName: cmp.asset?.name ?? null,
    assetSize: cmp.asset?.size ?? null,
  };
}

export interface ApplyUpdateOptions {
  force?: boolean;
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
  const { force, onProgress } = options ?? {};

  onProgress?.('checking', 'Checking for updates...');
  const { release, meta } = await fetchLatestRelease();
  const cmp = compareRelease(release, meta);

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
  const proc = Bun.spawn(
    [
      'tar',
      'xzf',
      archivePath,
      '-C',
      destDir,
    ],
    {
      stdout: 'ignore',
      stderr: 'pipe',
    }
  );

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
    const proc = Bun.spawn(
      [
        'cmd',
        '/c',
        'move',
        '/Y',
        currentPath,
        backupPath,
      ],
      {
        stdout: 'ignore',
        stderr: 'ignore',
      }
    );
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

export async function selfUpdate(options?: { force?: boolean }): Promise<void> {
  const currentCommitLabel = pc.dim(`(${buildInfo.commit})`);
  const versionLabel = pc.dim(`v${hub.version}`);
  console.log(`${pc.cyan('brika')} ${versionLabel} ${currentCommitLabel}`);
  console.log();

  try {
    const result = await applyUpdate({
      force: options?.force,
      onProgress(phase, detail) {
        if (phase !== 'complete') {
          console.log(`  ${pc.dim(detail)}`);
        }
      },
    });

    // Regenerate completions with the new binary (it's already on disk)
    try {
      const proc = Bun.spawn(
        [
          process.execPath,
          'completions',
        ],
        {
          stdout: 'ignore',
          stderr: 'ignore',
        }
      );
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
