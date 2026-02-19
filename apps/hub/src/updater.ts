/**
 * BRIKA Self-Updater
 *
 * Checks GitHub Releases for the latest version and performs an in-place update.
 * Works on all platforms: Linux, macOS (Intel/ARM), Windows.
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
import { HUB_GITHUB_RELEASES_API, hub } from '@/hub';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GitHubRelease {
  tag_name: string;
  published_at: string;
  html_url: string;
  body: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: string;
  assetName: string | null;
  assetSize: number | null;
}

/** Returns a safe default UpdateInfo when no check has succeeded yet. */
export function noUpdateInfo(): UpdateInfo {
  return {
    currentVersion: hub.version,
    latestVersion: hub.version,
    updateAvailable: false,
    releaseUrl: '',
    releaseNotes: '',
    publishedAt: '',
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
    if (bv > av) return true;
    if (bv < av) return false;
  }
  return false;
}

/** Fetch latest release info from GitHub */
async function fetchLatestRelease(): Promise<GitHubRelease> {
  const response = await fetch(HUB_GITHUB_RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json' },
  });

  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`);
  }

  return response.json() as Promise<GitHubRelease>;
}

/**
 * Check for updates without applying them.
 * Safe to call from background tasks or API.
 */
export async function checkForUpdate(): Promise<UpdateInfo> {
  const currentVersion = hub.version;
  const release = await fetchLatestRelease();
  const latestVersion = release.tag_name.replace(/^v/, '');
  const assetName = getAssetName();
  const asset = release.assets.find((a) => a.name === assetName);

  return {
    currentVersion,
    latestVersion,
    updateAvailable: isNewer(currentVersion, latestVersion),
    releaseUrl: release.html_url,
    releaseNotes: release.body ?? '',
    publishedAt: release.published_at,
    assetName: asset?.name ?? null,
    assetSize: asset?.size ?? null,
  };
}

/**
 * Download and apply update. Returns the new version string.
 * Used by both CLI and API.
 */
export async function applyUpdate(
  onProgress?: (phase: string, detail: string) => void
): Promise<{ previousVersion: string; newVersion: string }> {
  const currentVersion = hub.version;

  onProgress?.('checking', 'Checking for updates...');
  const release = await fetchLatestRelease();
  const latestVersion = release.tag_name.replace(/^v/, '');

  if (!isNewer(currentVersion, latestVersion)) {
    throw new Error(`Already up to date (v${currentVersion})`);
  }

  const assetName = getAssetName();
  const asset = release.assets.find((a) => a.name === assetName);
  if (!asset) {
    throw new Error(`No binary available for ${process.platform}/${process.arch}`);
  }

  // Download
  onProgress?.('downloading', `Downloading v${latestVersion}...`);
  const tmpDir = join(tmpdir(), `brika-update-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
  const archivePath = join(tmpDir, asset.name);

  try {
    await downloadFile(asset.browser_download_url, archivePath);

    // Extract
    onProgress?.('extracting', 'Extracting...');
    const extractDir = join(tmpDir, 'extracted');
    await mkdir(extractDir, { recursive: true });

    if (asset.name.endsWith('.zip')) {
      await extractZip(archivePath, extractDir);
    } else {
      await extractTarGz(archivePath, extractDir);
    }

    // Replace
    onProgress?.('installing', 'Installing...');
    const installDir = dirname(process.execPath);
    await replaceInstallation(extractDir, installDir);

    onProgress?.('complete', `Updated to v${latestVersion}`);

    return { previousVersion: currentVersion, newVersion: latestVersion };
  } finally {
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Non-critical
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// File operations
// ─────────────────────────────────────────────────────────────────────────────

async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  await Bun.write(destPath, response);
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
    { stdout: 'ignore', stderr: 'pipe' }
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
  await replaceBinary(join(sourceDir, `bun${ext}`), join(installDir, `bun${ext}`), isWindows);

  await replaceDir(join(sourceDir, 'ui'), join(installDir, 'ui'));
}

/**
 * Some archives extract into a single root directory (e.g. brika-v0.2.0/).
 * Detect that and return the inner directory so callers can treat either
 * layout the same way.
 */
function resolveSourceDir(extractedDir: string): string {
  const entries = [...new Bun.Glob('*').scanSync({ cwd: extractedDir, onlyFiles: false })];
  if (entries.length !== 1) return extractedDir;

  const subDir = join(extractedDir, entries[0] ?? '');
  try {
    const subEntries = [...new Bun.Glob('*').scanSync({ cwd: subDir, onlyFiles: false })];
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
  if (!(await Bun.file(newPath).exists())) return;

  const backupPath = `${currentPath}.${isWindows ? 'old' : 'bak'}`;
  await rm(backupPath, { force: true }).catch(() => undefined);

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
  if (!isWindows) await chmod(currentPath, 0o755);

  await rm(backupPath, { force: true }).catch(() => undefined);
}

async function replaceDir(newDir: string, currentDir: string): Promise<void> {
  let hasEntries: boolean;
  try {
    hasEntries = [...new Bun.Glob('*').scanSync({ cwd: newDir, onlyFiles: false })].length > 0;
  } catch {
    return; // source dir doesn't exist
  }
  if (!hasEntries) return;

  await rm(currentDir, { recursive: true, force: true });
  await cp(newDir, currentDir, { recursive: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point (interactive with terminal output)
// ─────────────────────────────────────────────────────────────────────────────

export async function selfUpdate(): Promise<void> {
  const currentVersion = hub.version;
  const versionLabel = pc.dim('v' + currentVersion);
  console.log(`${pc.cyan('brika')} ${versionLabel}`);
  console.log();

  try {
    const result = await applyUpdate((phase, detail) => {
      if (phase !== 'complete') {
        console.log(`  ${pc.dim(detail)}`);
      }
    });

    console.log();
    console.log(
      `  ${pc.green('Updated successfully!')} v${result.previousVersion} → v${pc.bold(result.newVersion)}`
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Already up to date')) {
      console.log(`  ${pc.green(msg)}`);
    } else {
      console.error(`  ${pc.red('Update failed:')} ${msg}`);
      process.exit(1);
    }
  }
}
