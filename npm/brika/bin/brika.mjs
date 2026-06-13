#!/usr/bin/env node
/**
 * brika: npm launcher.
 *
 * Brika ships as a self-contained, Bun-compiled binary, one per platform. Rather
 * than publish a package per platform, this single launcher downloads the binary
 * matching the host on first run, verifies it against the release `checksums`,
 * caches it under the user's data dir, and execs it. Later runs use the cache.
 *
 * `BRIKA_INSTALL=npm` is exported so the binary stores data in the per-user dir
 * (~/.brika or %LOCALAPPDATA%\brika) and routes `brika update` to npm.
 *
 * Zero dependencies: Node 18+ built-ins only (global fetch, node:crypto, and the
 * system `tar`, which handles .tar.gz and .zip on macOS, Linux, and Windows 10+).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
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

/** Download the platform binary for VERSION, verify its checksum, extract, cache. */
async function install(target, binPath) {
  const tag = `v${VERSION}`;
  const assetFile = `${target.asset}.${target.ext}`;
  const base = `https://github.com/${REPO}/releases/download/${tag}`;

  // Expected sha256 from the release manifest (same file install.sh verifies against).
  let expected;
  try {
    const meta = await (await fetchOk(`${base}/release-meta.json`)).json();
    expected = meta?.checksums?.[assetFile];
  } catch {
    // No manifest reachable; fall through and skip checksum (HTTPS + canonical release).
  }

  process.stderr.write(`brika: downloading ${assetFile} (${tag})...\n`);
  const bytes = Buffer.from(await (await fetchOk(`${base}/${assetFile}`)).arrayBuffer());

  if (expected) {
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== expected) {
      throw new Error(`checksum mismatch for ${assetFile} (expected ${expected}, got ${actual})`);
    }
  }

  // Extract into a temp dir, then atomically rename into place so a half-written
  // cache (or a concurrent run) never yields a partial binary.
  const versionDir = join(cacheRoot(), VERSION);
  const stagingDir = `${versionDir}.tmp-${process.pid}`;
  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });
  const archive = join(stagingDir, assetFile);
  await writeFile(archive, bytes);
  // bsdtar (the system `tar`) extracts both .tar.gz and .zip on every supported OS.
  execFileSync('tar', ['-xf', archive, '-C', stagingDir], { stdio: 'ignore' });
  rmSync(archive, { force: true });

  if (!existsSync(join(stagingDir, target.bin))) {
    rmSync(stagingDir, { recursive: true, force: true });
    throw new Error(`binary "${target.bin}" not found inside ${assetFile}`);
  }
  if (process.platform !== 'win32') {
    chmodSync(join(stagingDir, target.bin), 0o755);
  }

  if (!existsSync(binPath)) {
    mkdirSync(dirname(versionDir), { recursive: true });
    renameSync(stagingDir, versionDir);
  } else {
    // A concurrent run won the race; discard our copy.
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
      `failed to download the brika binary: ${error.message}\n` +
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
process.exit(result.status ?? 1);
