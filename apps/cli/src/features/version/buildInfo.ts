/**
 * Reads the current branch + commit short-hash directly from `.git/` so
 * `brika version` can show source-tree info without spawning `git`. The
 * commit date is dropped — pulling it would require parsing zlib-packed
 * git objects, and Sonar's S4036 (PATH-lookup spawn) made the previous
 * `git log -1` call a security hotspot we couldn't dismiss.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface BuildInfo {
  readonly branch: string | null;
  readonly commit: string | null;
  readonly commitDate: string | null;
}

export const EMPTY_BUILD_INFO: BuildInfo = { branch: null, commit: null, commitDate: null };

const REF_PREFIX = 'refs/heads/';

export function readBuildInfo(): BuildInfo {
  const gitDir = join(process.cwd(), '.git');
  if (!existsSync(gitDir)) {
    return EMPTY_BUILD_INFO;
  }
  const head = safeRead(join(gitDir, 'HEAD'));
  if (!head) {
    return EMPTY_BUILD_INFO;
  }
  // Detached HEAD: HEAD contains the SHA directly.
  const refMatch = /^ref: (.+)$/.exec(head);
  if (!refMatch) {
    return { branch: null, commit: head.slice(0, 7), commitDate: null };
  }
  const refPath = refMatch[1] ?? '';
  const branch = refPath.startsWith(REF_PREFIX) ? refPath.slice(REF_PREFIX.length) : null;
  const sha = safeRead(join(gitDir, refPath)) ?? readPackedRef(gitDir, refPath);
  return { branch, commit: sha ? sha.slice(0, 7) : null, commitDate: null };
}

/** Loose refs live at `.git/refs/heads/<name>`. Once `git gc` packs them
 *  away, they're concatenated into `.git/packed-refs` instead. */
function readPackedRef(gitDir: string, refPath: string): string | null {
  const packed = safeRead(join(gitDir, 'packed-refs'));
  if (!packed) {
    return null;
  }
  for (const line of packed.split('\n')) {
    if (line.length === 0 || line.startsWith('#') || line.startsWith('^')) {
      continue;
    }
    const spaceIdx = line.indexOf(' ');
    if (spaceIdx === -1) {
      continue;
    }
    if (line.slice(spaceIdx + 1) === refPath) {
      return line.slice(0, spaceIdx);
    }
  }
  return null;
}

function safeRead(path: string): string | null {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return null;
  }
}
