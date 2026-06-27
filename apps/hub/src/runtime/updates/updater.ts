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

import { createWriteStream } from 'node:fs';
import { chmod, cp, mkdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve as resolvePath } from 'node:path';
import { z } from 'zod';
import { buildInfo } from '../../build-info';
import { HUB_GITHUB_RELEASES_API, HUB_GITHUB_RELEASES_LIST_API, HUB_REPO, hub } from '../../hub';
import { brikaContext } from '../context/brika-context';
import { DEFAULT_CHANNEL_ID, type UpdateChannelId } from './channels';
import { GithubEtagCache } from './etag-cache';
import { BRIKA_SIGNING_PUBKEY_B64, verifyMinisignFile } from './signature';
import {
  commitStagedArtifacts,
  discardStagedArtifacts,
  runStagedSelfCheck,
  stageArtifacts,
} from './staged-install';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

const GitHubReleaseAssetSchema = z.object({
  name: z.string(),
  browser_download_url: z.string(),
  size: z.number(),
});

const GitHubReleaseSchema = z.object({
  tag_name: z.string(),
  // GitHub always includes these but we accept missing fields with
  // safe defaults so older / hand-rolled fixtures (in tests, in
  // user-curated mirrors) don't fail at the parse boundary. The
  // `body` field is also explicitly nullable — GitHub returns
  // `null` for releases authored without notes.
  target_commitish: z.string().default(''),
  published_at: z.string().default(''),
  html_url: z.string().default(''),
  body: z
    .union([z.string(), z.null()])
    .default('')
    .transform((v) => v ?? ''),
  prerelease: z.boolean().default(false),
  assets: z.array(GitHubReleaseAssetSchema),
});
export type GitHubRelease = z.infer<typeof GitHubReleaseSchema>;

const GitHubReleaseListSchema = z.array(GitHubReleaseSchema);

/** Metadata embedded as a release asset — provides build info + per-platform checksums */
const ReleaseMetaSchema = z.object({
  version: z.string(),
  /** Human-friendly release label ("canary" or "0.5.0"). The semver
   *  comparison uses `version`; this is for display only. Optional so
   *  older release-meta.json files (pre-canary-retention) still parse. */
  name: z.string().optional(),
  commit: z.string(),
  branch: z.string(),
  date: z.string(),
  bun: z.string(),
  checksums: z.record(z.string(), z.string()),
});
type ReleaseMeta = z.infer<typeof ReleaseMetaSchema>;

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
 * Strict allowlist for asset filenames. `asset.name` comes straight
 * from the GitHub Releases API — a compromised release (CI key
 * leak, hijacked publisher account, MITM with a forged manifest)
 * could ship a name like `brika-linux-x64'; rm -rf $HOME; '.tar.gz`
 * that, on Windows, would be embedded into a PowerShell
 * `Expand-Archive -Path '...' -DestinationPath '...'` invocation
 * and execute as command injection.
 *
 * The defence is upstream of every code path that *uses* the name:
 * refuse anything that doesn't match the published artifact shape
 * before we even download.
 */
const ASSET_NAME_RE = /^brika-(linux|darwin|windows)-(x64|arm64)\.(?:zip|tar\.gz)$/u;

/** Exported for unit testing — the regex itself is the contract. */
export function isSafeAssetName(name: string): boolean {
  return ASSET_NAME_RE.test(name);
}

/**
 * Build the staging paths used by `applyUpdate` from an asset name +
 * a version. `basename()` mirrors `isSafeAssetName` at the
 * path-construction sink — defence-in-depth + visible-to-analyser.
 * Exported for unit testing the path-traversal containment.
 */
export function deriveCachePaths(
  assetName: string,
  version: string
): { safeAssetName: string; tmpDir: string; archivePath: string } {
  const safeAssetName = basename(assetName);
  const tmpDir = join(brikaContext.systemDir, '.update-cache', `${version}-${safeAssetName}`);
  const archivePath = join(tmpDir, safeAssetName);
  return { safeAssetName, tmpDir, archivePath };
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

    // Validate against the schema rather than trusting `response.json()`
    // — a tampered or truncated meta-file would otherwise reach the
    // checksum-verify path typed as if it were sound.
    const parsed = ReleaseMetaSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Module-level cache instance. Lazy-initialized so tests can avoid
// hitting the filesystem unless they exercise this code path.
let etagCache: GithubEtagCache | null = null;
function getEtagCache(): GithubEtagCache {
  etagCache ??= new GithubEtagCache(brikaContext.systemDir);
  return etagCache;
}

/**
 * Match heuristic for the beta channel — pre-release tags that look
 * like "release candidates" (`-rc.N`, `-beta.N`). Everything else
 * (canary, nightly, ad-hoc pre-releases) routes through the canary
 * channel instead.
 */
const BETA_TAG_RE = /-(?:rc|beta)\b/;

/** Fetch latest release info from GitHub API for the given channel */
async function fetchLatestRelease(
  channel: UpdateChannelId,
  options?: { pinnedVersion?: string | null }
): Promise<{ release: GitHubRelease; meta: ReleaseMeta | null }> {
  const cache = getEtagCache();
  const headers = { Accept: 'application/vnd.github+json' };

  if (channel === 'pinned') {
    const version = options?.pinnedVersion;
    if (typeof version !== 'string' || version.length === 0) {
      throw new Error(
        'Pinned channel selected but no version was set. Configure it in Settings → Updates.'
      );
    }
    const tag = version.startsWith('v') ? version : `v${version}`;
    const url = `https://api.github.com/repos/${HUB_REPO}/releases/tags/${encodeURIComponent(tag)}`;
    const { body } = await cache.fetchJson(url, GitHubReleaseSchema, { headers });
    return { release: body, meta: await fetchReleaseMeta(body) };
  }

  if (channel === 'stable') {
    const { body } = await cache.fetchJson(HUB_GITHUB_RELEASES_API, GitHubReleaseSchema, {
      headers,
    });
    return { release: body, meta: await fetchReleaseMeta(body) };
  }

  // beta + canary: list pre-releases and pick by heuristic.
  const { body } = await cache.fetchJson(
    `${HUB_GITHUB_RELEASES_LIST_API}?per_page=10`,
    GitHubReleaseListSchema,
    { headers }
  );
  const prereleases = body.filter((r) => r.prerelease);
  const pick =
    channel === 'beta'
      ? prereleases.find((r) => BETA_TAG_RE.test(r.tag_name))
      : (prereleases.find((r) => !BETA_TAG_RE.test(r.tag_name)) ?? prereleases[0]);
  if (!pick) {
    throw new Error(`No ${channel} release found`);
  }
  return { release: pick, meta: await fetchReleaseMeta(pick) };
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
  // Prefer the meta's `version` (the binary's actual reported version,
  // injected via BRIKA_VERSION at build time) over the tag name. With
  // dated canary tags like `canary-20260527-193245-abc1234`, the tag
  // isn't valid semver but the meta still carries the proper
  // `0.3.1-canary.<ts>.<sha>`. Stable releases (`v0.5.0`) keep the
  // existing behaviour via the tag-name fallback.
  const latestVersion = meta?.version ?? release.tag_name.replace(/^v/, '');
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

export interface CheckOptions {
  /** Required when `channel === 'pinned'`; ignored otherwise. */
  readonly pinnedVersion?: string | null;
}

/**
 * Check for updates without applying them.
 * Safe to call from background tasks or API.
 */
export async function checkForUpdate(
  channel: UpdateChannelId = DEFAULT_CHANNEL_ID,
  options?: CheckOptions
): Promise<UpdateInfo> {
  const { release, meta } = await fetchLatestRelease(channel, options);
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
  /** Required when `channel === 'pinned'`; ignored otherwise. */
  pinnedVersion?: string | null;
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
  const { force, channel = DEFAULT_CHANNEL_ID, pinnedVersion, onProgress } = options ?? {};

  onProgress?.('checking', 'Checking for updates...');
  const { release, meta } = await fetchLatestRelease(channel, { pinnedVersion });
  const cmp = compareRelease(release, meta, channel);

  if (!force && !cmp.versionBump && !cmp.devBuild) {
    throw new Error(`Already up to date (v${hub.version})`);
  }

  const { asset } = cmp;
  if (!asset) {
    throw new Error(`No binary available for ${process.platform}/${process.arch}`);
  }
  // Refuse anything that doesn't match the published artifact shape.
  // `asset.name` flows into shell args (Windows PowerShell extract)
  // and filesystem paths — a tampered or maliciously named release
  // asset would otherwise reach those sinks unchecked.
  if (!isSafeAssetName(asset.name)) {
    throw new Error(
      `Refusing release asset with unexpected name shape: ${JSON.stringify(asset.name)}`
    );
  }

  // Stage inside the user-owned brikaDir rather than the shared
  // `os.tmpdir()` — predictable paths under `/tmp` are a symlink-TOCTOU
  // primitive on shared hosts (pre-create the path as a symlink to
  // someone else's file, the hub then writes through the symlink).
  // The brikaDir is created with the hub user's permissions and not
  // writable by other users; resume semantics are preserved because
  // the (version, asset) tuple still uniquely identifies the partial.
  const { tmpDir, archivePath, safeAssetName } = deriveCachePaths(asset.name, cmp.latestVersion);
  await mkdir(tmpDir, { recursive: true });

  try {
    await downloadFile(asset.browser_download_url, tmpDir, safeAssetName, asset.size, (pct) => {
      onProgress?.('downloading', `Downloading v${cmp.latestVersion}... ${pct}%`);
    });

    // Verify SHA256 integrity
    if (cmp.meta) {
      onProgress?.('verifying', 'Verifying integrity...');
      await verifyChecksum(cmp.meta, asset.name, archivePath);
    } else {
      onProgress?.('verifying', 'Skipping integrity check — no release metadata available');
    }

    // Verify minisign signature (supply-chain trust). The asset is
    // shipped alongside a `<asset>.minisig` file once the signing key
    // ceremony is live; until then the verifier returns 'skipped' and
    // we log a notice rather than blocking the apply.
    onProgress?.('verifying', 'Verifying signature...');
    await maybeVerifySignature(release, asset, archivePath, tmpDir, cmp.latestVersion, onProgress);

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

/**
 * Download the asset's `.minisig` companion (if published) and run
 * the local minisign verifier. Three outcomes:
 *
 *   - signature absent + no embedded pubkey → log "skipped", continue
 *   - signature absent + pubkey present     → throw (refuse unsigned update)
 *   - signature present                     → verify; throw on mismatch
 */
/** Exported for direct unit testing — the integration path (via
 * `applyUpdate`) is hard to exercise without standing up real
 * archive + supervisor plumbing.
 *
 * `expectedVersion` is the version the updater decided to install
 * (`compareRelease`'s `latestVersion`: `meta.version` with a tag-name
 * fallback). CI signs the trusted comment as `brika <BINARY_VERSION> <file>`
 * with that same package version, NOT the tag — dated canary tags
 * (`canary-20260610-...`) never appear in the comment, so binding to
 * `release.tag_name` rejected every legitimately-signed canary update. */
export async function maybeVerifySignature(
  release: GitHubRelease,
  asset: GitHubRelease['assets'][number],
  archivePath: string,
  tmpDir: string,
  expectedVersion: string,
  onProgress: ApplyUpdateOptions['onProgress']
): Promise<void> {
  const sigAsset = release.assets.find((a) => a.name === `${asset.name}.minisig`);
  const pubkeyEmbedded = BRIKA_SIGNING_PUBKEY_B64.length > 0;

  if (!sigAsset) {
    if (!pubkeyEmbedded) {
      // No key ceremony yet, no .minisig in the release — pre-Phase-3
      // shape of the release. Skip silently.
      onProgress?.('verifying', 'Signature verification skipped (no key ceremony yet)');
      return;
    }
    // Pubkey embedded but the release didn't ship a .minisig. Refuse
    // rather than silently downgrade trust.
    throw new Error('Signature required but no .minisig asset was published for this release');
  }

  const sigFileName = `${basename(asset.name)}.minisig`;
  const sigPath = join(tmpDir, sigFileName);
  await downloadFile(sigAsset.browser_download_url, tmpDir, sigFileName, sigAsset.size);
  const result = await verifyMinisignFile(archivePath, sigPath, BRIKA_SIGNING_PUBKEY_B64, {
    version: expectedVersion,
    asset: asset.name,
  });
  if (result.status === 'failed') {
    throw new Error(`Signature verification failed: ${result.reason}`);
  }
  if (result.status === 'skipped') {
    onProgress?.('verifying', `Signature skipped: ${result.reason}`);
    return;
  }
  onProgress?.('verifying', 'Signature verified.');
}

/**
 * Verify a downloaded archive against the `release-meta.json`
 * checksums. Exported for direct unit testing — the integration path
 * (via `applyUpdate`) is hard to exercise without real `Bun.spawn`
 * extraction.
 */
export async function verifyChecksum(
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

async function detectPartial(destPath: string): Promise<number> {
  const existing = Bun.file(destPath);
  return (await existing.exists()) ? existing.size : 0;
}

async function streamResponseToFile(
  response: Response,
  destDir: string,
  fileName: string,
  totalBytes: number,
  startBytes: number,
  onProgress: (pct: number) => void,
  resumed: boolean
): Promise<void> {
  // basename() strips any separator so the filename cannot escape the root.
  const safeDestPath = resolvePath(destDir, basename(fileName));

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Download response has no body');
  }
  // `Bun.file().writer()` opens at offset 0 and truncates — fine for
  // a fresh download, fatal for a 206 resume (it would overwrite the
  // existing partial with the *range* bytes starting at position 0).
  // Use `fs.createWriteStream` with `flags: 'a'` so resume genuinely
  // appends to whatever's already on disk.
  const stream = createWriteStream(safeDestPath, { flags: resumed ? 'a' : 'w' });
  let downloaded = startBytes;
  let lastPct = -1;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      // Honour backpressure — wait for `drain` if `write` returns false.
      if (!stream.write(value)) {
        await new Promise<void>((resolve) => stream.once('drain', resolve));
      }
      downloaded += value.byteLength;
      const pct = Math.round((downloaded / totalBytes) * 100);
      if (pct !== lastPct) {
        lastPct = pct;
        onProgress(pct);
        // Yield to the macrotask queue so a caller's progress UI (the CLI
        // spinner repaints on a setInterval) gets a chance to run. A
        // buffered or fast body resolves reads as microtasks, which would
        // otherwise starve that timer and leave the percent frozen until
        // the download finishes. Bounded to once per integer percent.
        await new Promise<void>((resolve) => setTimeout(resolve));
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      stream.end((err: Error | null | undefined) => (err ? reject(err) : resolve()));
    });
  }
}

/** Exported for direct unit testing — exercises resume, no-progress,
 * stale-partial truncation, and stream-with-progress branches without
 * standing up the whole `applyUpdate` flow.
 *
 * Takes `(destDir, fileName)` rather than a single path so the sink can
 * apply `basename()` to the (potentially-tainted) filename without
 * losing the directory the caller wanted to write into. The combined
 * sanitiser-at-sink in `streamResponseToFile` is what satisfies Snyk's
 * `javascript/PT` flow-tracker, on top of the upstream
 * `isSafeAssetName` allow-list. */
export async function downloadFile(
  url: string,
  destDir: string,
  fileName: string,
  totalBytes: number,
  onProgress?: (pct: number) => void
): Promise<void> {
  // basename() collapses any traversal payload before the path is used.
  const destPath = join(destDir, basename(fileName));
  const partialSize = await detectPartial(destPath);

  // Partial already matches expected size — skip the network entirely.
  // Downstream checksum verification catches any corruption.
  if (totalBytes > 0 && partialSize === totalBytes) {
    onProgress?.(100);
    return;
  }

  const init: RequestInit =
    partialSize > 0 && totalBytes > 0 && partialSize < totalBytes
      ? { headers: { Range: `bytes=${partialSize}-` } }
      : {};

  const response = await fetch(url, init);
  if (!response.ok && response.status !== 206) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const resumed = response.status === 206;
  // 200 with a stale partial → truncate before writing the fresh body.
  if (!resumed && partialSize > 0) {
    await Bun.write(destPath, '');
  }

  if (!onProgress || !response.body || totalBytes <= 0) {
    await Bun.write(destPath, response);
    return;
  }
  await streamResponseToFile(
    response,
    destDir,
    fileName,
    totalBytes,
    resumed ? partialSize : 0,
    onProgress,
    resumed
  );
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

  if (isWindows) {
    // Windows can't rename the running EXE in-process; fall back to the
    // legacy `cmd /c move` + supervisor restart path until we ship a
    // supervisor that owns the post-exit swap. Staged install on POSIX
    // gives us the same guarantees with no supervisor cooperation.
    await replaceBinary(join(sourceDir, 'brika.exe'), process.execPath, true);
    await replaceDir(join(sourceDir, 'ui'), join(installDir, 'ui'));
    return;
  }

  try {
    // 1. Stage to `brika.next` / `ui.next` next to the live install.
    const { stagedBinary } = await stageArtifacts({ sourceDir, installDir });
    // 2. Probe the staged binary; throws on timeout / non-zero / bad JSON.
    await runStagedSelfCheck(stagedBinary);
    // 3. Atomic swap. Live `brika` becomes `brika.previous` (kept for
    //    the rollback window — `boot-rollback.ts` consumes it if the
    //    next boot crashes before recording success).
    commitStagedArtifacts(installDir);
  } catch (err) {
    // Self-check / staging failed — wipe the staged artifacts so the
    // next attempt starts clean. Live binary was never touched.
    discardStagedArtifacts(installDir);
    throw err;
  }
}

/**
 * Some archives extract into a single root directory (e.g. brika-v0.2.0/).
 * Detect that and return the inner directory so callers can treat either
 * layout the same way.
 */
export function resolveSourceDir(extractedDir: string): string {
  const entries = [
    ...new Bun.Glob('*').scanSync({
      cwd: extractedDir,
      onlyFiles: false,
    }),
  ];
  if (entries.length !== 1) {
    return extractedDir;
  }

  // `basename()` collapses any traversal payload to a single component.
  const subDir = join(extractedDir, basename(entries[0] ?? ''));
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
