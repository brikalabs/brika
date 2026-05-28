/**
 * Build Info Macros
 *
 * These functions are executed at bundle-time using Bun macros.
 * The return values are inlined directly into the bundle.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const PackageJsonSchema = z.object({ version: z.string().min(1) });

/**
 * Resolve git HEAD by reading `.git/HEAD` directly — no `git` subprocess,
 * no `.git/index.lock` contention. Spawning git from inside a Bun macro
 * (which runs at transpile time, in parallel across every worker when the
 * workspace test suite fans out) was racing on git's filesystem lock and
 * silently returning 'unknown' to one or two workers per push, which then
 * propagated into `buildInfo.commitFull` and broke any test that gates on
 * a known commit (e.g. updater dev-build detection).
 *
 * Returns `{ branch, commit }` where:
 *   - `branch` is the symbolic ref name (e.g. "main") or "HEAD" on detached
 *   - `commit` is the full 40-char SHA, or 'unknown' if it can't be resolved
 *
 * Handles three HEAD shapes:
 *   - `ref: refs/heads/<branch>\n` (normal): follow ref → loose or packed
 *   - 40-char SHA (detached HEAD): use directly
 *   - anything else: 'unknown'
 */
function resolveHead(): { branch: string; commit: string } {
  try {
    const gitDir = findGitDir();
    if (!gitDir) {
      return { branch: 'unknown', commit: 'unknown' };
    }
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
    const refMatch = /^ref:\s+(.+)$/.exec(head);
    if (!refMatch?.[1]) {
      return /^[0-9a-f]{40}$/i.test(head)
        ? { branch: 'HEAD', commit: head }
        : { branch: 'unknown', commit: 'unknown' };
    }
    const ref = refMatch[1];
    const branch = ref.replace(/^refs\/heads\//, '');
    return { branch, commit: resolveRef(gitDir, ref) };
  } catch {
    return { branch: 'unknown', commit: 'unknown' };
  }
}

/** Resolve a ref name to a SHA via loose file → packed-refs fallback. */
function resolveRef(gitDir: string, ref: string): string {
  const loose = join(gitDir, ref);
  if (existsSync(loose)) {
    return readFileSync(loose, 'utf8').trim();
  }
  // Packed-refs: lines of `<sha> <ref>`. `#` is a header comment, `^` is a
  // peeled-tag line (the SHA the previous annotated-tag points at) — we
  // skip both because we want the line whose name column matches our ref.
  const packed = join(gitDir, 'packed-refs');
  if (!existsSync(packed)) {
    return 'unknown';
  }
  for (const line of readFileSync(packed, 'utf8').split('\n')) {
    if (line.startsWith('#') || line.startsWith('^')) {
      continue;
    }
    const [sha, name] = line.split(' ');
    if (name === ref && sha) {
      return sha;
    }
  }
  return 'unknown';
}

/** Locate `.git`. Walks up from the macro source until found; `null` if none. */
function findGitDir(): string | null {
  let dir = import.meta.dir;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, '.git');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = join(dir, '..');
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
  return null;
}

export function getGitCommit(): string {
  const full = resolveHead().commit;
  return full === 'unknown' ? 'unknown' : full.slice(0, 7);
}

/** Full 40-char git commit SHA — used for exact build identification. */
export function getGitCommitFull(): string {
  return resolveHead().commit;
}

export function getGitBranch(): string {
  return resolveHead().branch;
}

export function getBuildDate(): string {
  return new Date().toISOString();
}

/**
 * Build-time version string. CI sets `BRIKA_VERSION` from the git tag
 * (`v1.2.3` → `1.2.3`) or a canary recipe (`<base>-canary.<ts>.<sha>`).
 * Local dev falls back to `apps/hub/package.json` so `bun dev` and tests
 * keep working without the env var.
 */
export function getBrikaVersion(): string {
  const fromEnv = process.env.BRIKA_VERSION?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const raw = readFileSync(join(import.meta.dir, '../package.json'), 'utf8');
  return PackageJsonSchema.parse(JSON.parse(raw)).version;
}
