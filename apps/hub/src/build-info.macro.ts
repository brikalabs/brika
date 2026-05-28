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

const REF_PREFIX = 'ref: ';
const REFS_HEADS_PREFIX = 'refs/heads/';
const SHA_LENGTH = 40;

/**
 * True if `s` is a 40-char lowercase hex string.
 *
 * Exported for unit tests — internal callers don't import it.
 */
export function isFullSha(s: string): boolean {
  if (s.length !== SHA_LENGTH) {
    return false;
  }
  for (let i = 0; i < SHA_LENGTH; i++) {
    const c = s.codePointAt(i);
    if (c === undefined || !((c >= 48 && c <= 57) || (c >= 97 && c <= 102))) {
      return false;
    }
  }
  return true;
}

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
  const gitDir = findGitDir();
  if (!gitDir) {
    return { branch: 'unknown', commit: 'unknown' };
  }
  return resolveHeadAt(gitDir);
}

/**
 * Read HEAD from the given git directory and resolve it to a
 * `{ branch, commit }` pair. Pure I/O on a single directory — separated
 * from `resolveHead()` (which goes through `findGitDir()`) so unit tests
 * can point it at a temp `.git` layout.
 *
 * Uses a string-prefix check (`startsWith('ref: ')`) instead of a regex
 * to sidestep SonarCloud's ReDoS hotspot: git always writes the ref
 * separator as a single space (`write-ref.c::write_ref_to_lockfile`),
 * and branch names cannot contain whitespace (`refs.c`), so the strict
 * slice is correct.
 */
export function resolveHeadAt(gitDir: string): { branch: string; commit: string } {
  try {
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
    if (head.startsWith(REF_PREFIX)) {
      const ref = head.slice(REF_PREFIX.length);
      const branch = ref.startsWith(REFS_HEADS_PREFIX) ? ref.slice(REFS_HEADS_PREFIX.length) : ref;
      return { branch, commit: resolveRef(gitDir, ref) };
    }
    if (isFullSha(head)) {
      return { branch: 'HEAD', commit: head };
    }
    return { branch: 'unknown', commit: 'unknown' };
  } catch {
    return { branch: 'unknown', commit: 'unknown' };
  }
}

/**
 * Resolve a ref name to a SHA via loose file → packed-refs fallback.
 * Exported for unit tests.
 */
export function resolveRef(gitDir: string, ref: string): string {
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
