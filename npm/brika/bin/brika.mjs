#!/usr/bin/env node
/**
 * brika: npm launcher.
 *
 * Brika ships as a self-contained, Bun-compiled binary, one per platform. Rather
 * than publish a package per platform, this single launcher downloads the binary
 * matching the host on first run, verifies it against the release `checksums`
 * (fail closed, like scripts/install.sh), caches it under the user's data dir,
 * and execs it. Later runs use the cache.
 *
 * `BRIKA_INSTALL=npm` is exported so the binary stores data in the per-user dir
 * (~/.brika or %LOCALAPPDATA%\brika) and treats itself as package-manager-managed:
 * `brika update` defers to the package manager instead of self-patching. The
 * marker is set for ANY npm-registry install (npm, pnpm, yarn, bun), since they
 * all install this bin the same way; "npm" just names the registry/ecosystem.
 *
 * Zero dependencies: Node 18+ built-ins only (global fetch, node:crypto, and the
 * system `tar`, which handles .tar.gz and .zip on macOS, Linux, and Windows 10+).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { constants, homedir } from 'node:os';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const { version: VERSION } = require('../package.json');

const REPO = 'brikalabs/brika';

/** `${platform}-${arch}` -> release asset basename, archive extension, binary name. */
const TARGETS = {
  'linux-x64': { asset: 'brika-linux-x64', ext: 'tar.gz', bin: 'brika' },
  'linux-arm64': { asset: 'brika-linux-arm64', ext: 'tar.gz', bin: 'brika' },
  'darwin-x64': { asset: 'brika-darwin-x64', ext: 'tar.gz', bin: 'brika' },
  'darwin-arm64': { asset: 'brika-darwin-arm64', ext: 'tar.gz', bin: 'brika' },
  'win32-x64': { asset: 'brika-windows-x64', ext: 'zip', bin: 'brika.exe' },
};

/** Per-user cache root for downloaded binaries (kept out of the data dir's way). */
function cacheRoot() {
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
    return join(base, 'brika', 'npm-bin');
  }
  return join(homedir(), '.brika', 'npm-bin');
}

/**
 * The `tar` to use. On Windows, pin to System32\tar.exe (bsdtar, which unpacks
 * .zip); a bare `tar` could resolve to a GNU tar from Git Bash / MSYS2 earlier on
 * PATH, which cannot extract .zip.
 */
function tarBin() {
  if (process.platform === 'win32') {
    const root = process.env.SystemRoot || 'C:\\Windows';
    return join(root, 'System32', 'tar.exe');
  }
  return 'tar';
}

function fail(message) {
  process.stderr.write(`brika: ${message}\n`);
  process.exit(1);
}

async function fetchOk(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${url}`);
  }
  return res;
}

/** Extract an archive (.tar.gz or .zip) with a clear error if `tar` is missing. */
function extract(archive, dest, assetFile) {
  try {
    execFileSync(tarBin(), ['-xf', archive, '-C', dest], { stdio: 'ignore' });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('the system `tar` command is required to unpack the brika binary, but it was not found');
    }
    throw new Error(`failed to extract ${assetFile} (${error.message})`);
  }
}

/** Best-effort removal of staging dirs left by interrupted earlier runs. */
function sweepStaleStaging(root, version) {
  try {
    for (const name of readdirSync(root)) {
      if (name.startsWith(`${version}.tmp-`)) {
        rmSync(join(root, name), { recursive: true, force: true });
      }
    }
  } catch {
    // Root doesn't exist yet, or isn't readable; nothing to sweep.
  }
}

/** Download the platform binary for VERSION, verify its checksum, extract, cache. */
async function install(target, binPath) {
  const tag = `v${VERSION}`;
  const assetFile = `${target.asset}.${target.ext}`;
  const base = `https://github.com/${REPO}/releases/download/${tag}`;

  // Fail closed (mirrors install.sh): the manifest must load AND record a
  // checksum for this asset, otherwise we refuse rather than exec an
  // unverifiable native binary. A tampered manifest that omits the key, an
  // unreachable manifest, and a malformed manifest all stop the install here.
  const meta = await (await fetchOk(`${base}/release-meta.json`)).json();
  const expected = meta?.checksums?.[assetFile];
  if (typeof expected !== 'string' || expected === '') {
    throw new Error(
      `no checksum recorded for ${assetFile} in release-meta.json; refusing to install an unverifiable binary`
    );
  }

  process.stderr.write(`brika: downloading ${assetFile} (${tag})...\n`);
  const bytes = Buffer.from(await (await fetchOk(`${base}/${assetFile}`)).arrayBuffer());
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) {
    throw new Error(`checksum mismatch for ${assetFile} (expected ${expected}, got ${actual})`);
  }

  // Extract into a per-pid temp dir, then atomically rename into place so a
  // half-written cache never yields a partial binary.
  const versionDir = join(cacheRoot(), VERSION);
  sweepStaleStaging(cacheRoot(), VERSION);
  const stagingDir = `${versionDir}.tmp-${process.pid}`;
  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });
  try {
    const archive = join(stagingDir, assetFile);
    await writeFile(archive, bytes);
    extract(archive, stagingDir, assetFile);
    rmSync(archive, { force: true });

    if (!existsSync(join(stagingDir, target.bin))) {
      throw new Error(`binary "${target.bin}" not found inside ${assetFile}`);
    }
    if (process.platform !== 'win32') {
      chmodSync(join(stagingDir, target.bin), 0o755);
    }

    try {
      mkdirSync(dirname(versionDir), { recursive: true });
      renameSync(stagingDir, versionDir);
    } catch (error) {
      // A concurrent first-run may have populated versionDir first (rename onto a
      // non-empty dir throws). If a valid binary is now cached, accept it.
      if (!existsSync(binPath)) {
        throw error;
      }
    }
  } finally {
    // No-op on success (rename moved it); cleans up on any failure path.
    rmSync(stagingDir, { recursive: true, force: true });
  }
}

const key = `${process.platform}-${process.arch}`;
const target = TARGETS[key];
if (!target) {
  fail(
    `unsupported platform ${key}.\n` +
      '  Supported: linux (x64, arm64), darwin (x64, arm64), win32 (x64).\n' +
      '  See https://github.com/brikalabs/brika for other install options.'
  );
}

const binPath = join(cacheRoot(), VERSION, target.bin);
if (!existsSync(binPath)) {
  try {
    await install(target, binPath);
  } catch (error) {
    fail(
      `failed to install the brika binary: ${error.message}\n` +
        '  Check your connection, or install without npm:\n' +
        '    curl -fsSL https://brika.dev/install.sh | sh'
    );
  }
}

const result = spawnSync(binPath, process.argv.slice(2), {
  stdio: 'inherit',
  env: { ...process.env, BRIKA_INSTALL: 'npm' },
});
if (result.error) {
  fail(`failed to launch the binary: ${result.error.message}`);
}
if (result.signal) {
  // Mirror a signal-terminated child as 128+signum (shell convention).
  process.exit(128 + (constants.signals[result.signal] ?? 0));
}
process.exit(result.status ?? 1);
