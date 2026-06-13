#!/usr/bin/env bun
/**
 * npm distribution: stamp and (optionally) publish the `brika` launcher package.
 *
 * Brika ships one compiled binary per platform via GitHub Releases. The npm
 * package (committed at `npm/brika`) is a single tiny launcher that downloads
 * the matching binary on first run (see `npm/brika/bin/brika.mjs`), so there are
 * no per-platform packages and no binaries to bundle here. This script just
 * stamps the release version into the launcher and publishes it.
 *
 * Usage:
 *   bun run src/npm-dist.ts                       # stage into dist/npm
 *   bun run src/npm-dist.ts --publish             # stage + npm publish
 *   bun run src/npm-dist.ts --publish --provenance --tag=latest
 */

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import pc from 'picocolors';
import { done, fail, log, step } from './log';

const REPO_ROOT = join(import.meta.dir, '../../..');

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  strict: false,
  options: {
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

/** Copy the committed launcher to the staging dir and patch its version. */
async function stampLauncher(version: string): Promise<string> {
  const launcherOut = join(outDir, 'brika');
  cpSync(join(REPO_ROOT, 'npm/brika'), launcherOut, { recursive: true });

  const pkgPath = join(launcherOut, 'package.json');
  const pkg: Record<string, unknown> = await Bun.file(pkgPath).json();
  pkg.version = version;
  await Bun.write(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  return launcherOut;
}

/** True if `brika@version` already exists on the registry (immutable, so a republish would 409). */
function isPublished(version: string): boolean {
  const proc = Bun.spawnSync(['npm', 'view', `brika@${version}`, 'version'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return proc.exitCode === 0 && proc.stdout.toString().trim() === version;
}

function publishLauncher(dir: string, version: string): boolean {
  // Idempotent: a retry after a transient failure must skip an already-live
  // version rather than 409. Skipped only for real publishes; a dry run still
  // exercises the publish.
  if (!dryRun && isPublished(version)) {
    log(pc.dim(`  brika@${version} already published (skip)`));
    return true;
  }
  const args = ['npm', 'publish', '--access', 'public', '--tag', tag];
  if (provenance) {
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

step('Stamping launcher package...');
const launcherDir = await stampLauncher(version);
log(pc.dim(`  brika@${version} (launcher)`));

if (!publish) {
  console.log();
  done(`Staged brika@${version} in ${pc.bold(outDir)} (no --publish).`);
  process.exit(0);
}

console.log();
step('Publishing to npm...');
if (!publishLauncher(launcherDir, version)) {
  console.log();
  fail('Failed to publish brika.');
  process.exit(1);
}
console.log();
done(`Published brika@${version}${dryRun ? ' (dry run)' : ''}.`);
