#!/usr/bin/env bun
/**
 * Version-monotonicity gate.
 *
 * A release version must never regress below the last published git tag.
 * This guards against accidentally lowering `package.json`'s `version`
 * (e.g. a bad rebase, a copy-paste, or a reverted bump) and shipping a
 * version that semver-sorts *before* something already released.
 *
 * The check:
 *   1. Read the root `package.json` version.
 *   2. Find the latest `v*` semver tag in git history.
 *   3. Compare with a proper semver compare (Bun's `semver.order`, which
 *      handles prerelease ordering and ignores build metadata).
 *   4. Exit non-zero with a clear message if the version is *less than*
 *      the latest tag. Equal or greater is a pass.
 *
 * If there are no release tags yet (fresh repo / shallow clone with no
 * tags) the gate is a no-op pass — there is nothing to regress against.
 *
 * Usage:
 *   bun packages/workspace-tools/src/check-version-monotonic.ts
 */

import { join } from 'node:path';
import { compareVersions } from './semver';

/** Strips a leading `v`/`V` from a tag so it becomes a bare semver string. */
export function stripTagPrefix(tag: string): string {
  return tag.replace(/^[vV]/, '');
}

const SEMVER_TAG = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** Returns true when a tag looks like a release tag (`v1.2.3`, `v1.2.3-rc.1`). */
export function isReleaseTag(tag: string): boolean {
  return SEMVER_TAG.test(tag);
}

/**
 * Pick the highest semver tag from a list, ignoring non-release tags
 * (`canary`, `next`, ...). Returns `null` when none qualify.
 */
export function latestReleaseTag(tags: ReadonlyArray<string>): string | null {
  let best: string | null = null;
  for (const tag of tags) {
    if (!isReleaseTag(tag)) {
      continue;
    }
    if (best === null || compareVersions(stripTagPrefix(tag), stripTagPrefix(best)) > 0) {
      best = tag;
    }
  }
  return best;
}

export type GateResult =
  | { ok: true; reason: 'no-tags' | 'monotonic'; version: string; tag: string | null }
  | { ok: false; reason: 'regression'; version: string; tag: string };

/**
 * Pure decision function: given the current version and the known tags,
 * decide whether the version regressed. Kept side-effect-free for testing.
 */
export function evaluateGate(version: string, tags: ReadonlyArray<string>): GateResult {
  const tag = latestReleaseTag(tags);
  if (tag === null) {
    return { ok: true, reason: 'no-tags', version, tag: null };
  }
  if (compareVersions(version, stripTagPrefix(tag)) < 0) {
    return { ok: false, reason: 'regression', version, tag };
  }
  return { ok: true, reason: 'monotonic', version, tag };
}

async function readRootVersion(): Promise<string> {
  const pkg: unknown = await Bun.file(join(process.cwd(), 'package.json')).json();
  if (
    typeof pkg === 'object' &&
    pkg !== null &&
    'version' in pkg &&
    typeof pkg.version === 'string'
  ) {
    return pkg.version;
  }
  throw new Error('Root package.json has no string "version" field.');
}

async function readTags(): Promise<string[]> {
  const proc = Bun.spawn(['git', 'tag', '--list'], { stdout: 'pipe', stderr: 'pipe' });
  const [out] = await Promise.all([new Response(proc.stdout).text()]);
  await proc.exited;
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function main(): Promise<void> {
  const version = await readRootVersion();
  const tags = await readTags();
  const result = evaluateGate(version, tags);

  if (!result.ok) {
    console.error(
      `Version regression: package.json version "${result.version}" is lower than the ` +
        `latest released tag "${result.tag}". Bump the version to ${stripTagPrefix(result.tag)} ` +
        'or higher before merging.'
    );
    process.exit(1);
  }

  if (result.reason === 'no-tags') {
    console.log(`No release tags found; version "${result.version}" accepted.`);
    return;
  }
  console.log(`Version "${result.version}" >= latest tag "${result.tag}". OK.`);
}

if (import.meta.main) {
  await main();
}
