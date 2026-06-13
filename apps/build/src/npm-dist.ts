#!/usr/bin/env bun
/**
 * npm distribution: stamp and (optionally) publish the npm packages that wrap
 * the compiled binaries.
 *
 * Pattern: one thin `brika` launcher package (the committed `npm/brika`) whose
 * `optionalDependencies` list a per-platform package (`@brika/cli-<os>-<cpu>`)
 * carrying a single prebuilt binary. npm installs only the package matching the
 * host's `os`/`cpu`; the launcher's shim execs it. No source is published; each
 * platform package ships just `bin/<binary>`.
 *
 * Usage:
 *   bun run src/npm-dist.ts --binaries=<dir>            # stamp into dist/npm
 *   bun run src/npm-dist.ts --binaries=<dir> --publish  # stamp + npm publish
 *   bun run src/npm-dist.ts --binaries=<dir> --publish --dry-run --tag=canary
 *
 * `--binaries` is a directory laid out as `<dir>/<artifact>/<binary>`, i.e. each
 * release artifact (e.g. `brika-darwin-arm64`) extracted into its own subdir.
 */

import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import pc from 'picocolors';
import { done, fail, log, step } from './log';

const REPO_ROOT = join(import.meta.dir, '../../..');

interface PlatformPackage {
  /** Release artifact basename (matches build.yml + install.sh). */
  readonly artifact: string;
  /** Node `process.platform` token. */
  readonly os: string;
  /** Node `process.arch` token. */
  readonly cpu: string;
  /** Binary filename inside the artifact. */
  readonly binary: string;
}

const PLATFORMS: readonly PlatformPackage[] = [
  { artifact: 'brika-linux-x64', os: 'linux', cpu: 'x64', binary: 'brika' },
  { artifact: 'brika-linux-arm64', os: 'linux', cpu: 'arm64', binary: 'brika' },
  { artifact: 'brika-darwin-x64', os: 'darwin', cpu: 'x64', binary: 'brika' },
  { artifact: 'brika-darwin-arm64', os: 'darwin', cpu: 'arm64', binary: 'brika' },
  { artifact: 'brika-windows-x64', os: 'win32', cpu: 'x64', binary: 'brika.exe' },
];

/** npm package name for a platform (the shim resolves `@brika/cli-${platform}-${arch}`). */
function platformPkgName(p: PlatformPackage): string {
  return `@brika/cli-${p.os}-${p.cpu}`;
}

const REPOSITORY = {
  type: 'git',
  url: 'git+https://github.com/brikalabs/brika.git',
} as const;

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  strict: false,
  options: {
    binaries: { type: 'string' },
    version: { type: 'string' },
    out: { type: 'string' },
    publish: { type: 'boolean', default: false },
    provenance: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    tag: { type: 'string', default: 'latest' },
  },
});

const publish = values.publish === true;
const provenance = values.provenance === true;
const dryRun = values['dry-run'] === true;
const tag = typeof values.tag === 'string' ? values.tag : 'latest';
const binariesDir = typeof values.binaries === 'string' ? values.binaries : undefined;
const outDir =
  typeof values.out === 'string' ? values.out : join(REPO_ROOT, 'apps/build/dist/npm');

async function resolveVersion(): Promise<string> {
  if (typeof values.version === 'string' && values.version !== '') {
    return values.version;
  }
  const root: { version?: string } = await Bun.file(join(REPO_ROOT, 'package.json')).json();
  if (!root.version) {
    fail('Could not resolve a version (no --version and root package.json has none).');
    process.exit(1);
  }
  return root.version;
}

/** Locate a platform's binary under `<binaries>/<artifact>/<binary>`. */
function binaryPath(p: PlatformPackage): string | undefined {
  if (!binariesDir) {
    return undefined;
  }
  const candidate = join(binariesDir, p.artifact, p.binary);
  return existsSync(candidate) ? candidate : undefined;
}

function writeJson(path: string, value: unknown): void {
  Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** Stamp a per-platform package dir; returns true if its binary was present. */
function stampPlatform(p: PlatformPackage, version: string): boolean {
  const src = binaryPath(p);
  const pkgDir = join(outDir, `cli-${p.os}-${p.cpu}`);
  mkdirSync(join(pkgDir, 'bin'), { recursive: true });

  writeJson(join(pkgDir, 'package.json'), {
    name: platformPkgName(p),
    version,
    description: `Brika prebuilt binary for ${p.os}-${p.cpu}.`,
    license: 'MIT',
    repository: REPOSITORY,
    os: [p.os],
    cpu: [p.cpu],
    files: ['bin'],
  });

  if (!src) {
    log(pc.yellow(`  skip ${platformPkgName(p)}: binary not found (${p.artifact}/${p.binary})`));
    return false;
  }
  const dest = join(pkgDir, 'bin', p.binary);
  cpSync(src, dest);
  chmodSync(dest, 0o755);
  log(pc.dim(`  ${platformPkgName(p)}@${version}  (${p.binary})`));
  return true;
}

/** Stamp the launcher package by copying the committed source and patching it. */
async function stampWrapper(version: string): Promise<string> {
  const wrapperOut = join(outDir, 'brika');
  cpSync(join(REPO_ROOT, 'npm/brika'), wrapperOut, { recursive: true });

  const pkgPath = join(wrapperOut, 'package.json');
  const pkg: Record<string, unknown> = await Bun.file(pkgPath).json();
  pkg.version = version;
  pkg.optionalDependencies = Object.fromEntries(
    PLATFORMS.map((p) => [platformPkgName(p), version])
  );
  writeJson(pkgPath, pkg);
  return wrapperOut;
}

/** True if `name@version` already exists on the registry (immutable, so a republish would 409). */
function isPublished(name: string, version: string): boolean {
  const proc = Bun.spawnSync(['npm', 'view', `${name}@${version}`, 'version'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return proc.exitCode === 0 && proc.stdout.toString().trim() === version;
}

function publishPackage(dir: string, name: string): boolean {
  // Idempotent: npm versions are immutable, so a retry after a partial publish
  // (or a transient mid-sequence failure) must skip what is already live rather
  // than 409 and wedge the release. Skipped only for real publishes; a dry run
  // still exercises every package.
  if (!dryRun && isPublished(name, version)) {
    log(pc.dim(`  ${name}@${version} already published (skip)`));
    return true;
  }
  const args = ['npm', 'publish', '--access', 'public', '--tag', tag];
  if (provenance) {
    // Trusted-publishing (OIDC) attaches provenance; the explicit flag makes it
    // deterministic across npm versions. Only passed in CI, where the OIDC
    // id-token is available; a local --dry-run omits it.
    args.push('--provenance');
  }
  if (dryRun) {
    args.push('--dry-run');
  }
  const proc = Bun.spawnSync(args, { cwd: dir, stdout: 'inherit', stderr: 'inherit' });
  return proc.exitCode === 0;
}

console.log();
log(pc.bold('BRIKA npm distribution'));

const version = await resolveVersion();
log(pc.dim(`version: ${version}  tag: ${tag}  out: ${outDir}${dryRun ? '  (dry run)' : ''}`));
console.log();

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

step('Stamping platform packages...');
const present = PLATFORMS.filter((p) => stampPlatform(p, version));

if (publish && present.length !== PLATFORMS.length) {
  console.log();
  fail(
    `Refusing to publish: ${PLATFORMS.length - present.length}/${PLATFORMS.length} platform ` +
      'binaries are missing. Pass --binaries=<dir> with every artifact extracted.'
  );
  process.exit(1);
}

step('Stamping launcher package...');
const wrapperDir = await stampWrapper(version);
log(pc.dim('  brika (launcher)'));

if (!publish) {
  console.log();
  done(`Staged ${present.length + 1} package(s) in ${pc.bold(outDir)} (no --publish).`);
  process.exit(0);
}

console.log();
step('Publishing to npm...');
// Platform packages first so the launcher's optionalDependencies resolve.
const failures: string[] = [];
for (const p of present) {
  if (!publishPackage(join(outDir, `cli-${p.os}-${p.cpu}`), platformPkgName(p))) {
    failures.push(platformPkgName(p));
  }
}
if (!publishPackage(wrapperDir, 'brika')) {
  failures.push('brika');
}

console.log();
if (failures.length > 0) {
  fail(`Failed to publish: ${failures.join(', ')}`);
  process.exit(1);
}
done(`Published brika + ${present.length} platform package(s)${dryRun ? ' (dry run)' : ''}.`);
