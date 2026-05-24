/**
 * Symlink-escape defence.
 *
 * `paths.ts` already rejects virtual paths that escape via `..` at the
 * string level. This module covers the kernel-level escape: a host
 * symlink inside the backing dir that points OUTSIDE the backing dir.
 *
 * For each op we:
 *   1. `realpath` the host path (follows symlinks atomically per the
 *      OS-level call)
 *   2. compare the resolved path against the backing dir prefix
 *   3. throw `FS_SYMLINK_ESCAPE` if it escaped
 *
 * Subtlety: `realpath` requires the path to exist. For ops that
 * intentionally target a non-existent path (writeFile create-new,
 * mkdir of a new dir), we walk up to the nearest existing ancestor and
 * check that instead. The remaining tail can't possibly be a symlink
 * target — it doesn't exist yet — so this is sufficient.
 */

import { realpath } from 'node:fs/promises';
import { dirname, sep } from 'node:path';
import { errors } from '@brika/errors';
import type { ResolvedPath } from './types';

/**
 * Verify that the host path stays inside the backing dir, traversing
 * symlinks via `realpath`. Throws `FS_SYMLINK_ESCAPE` on violation;
 * silently returns on success.
 *
 * `missingOk: true` lets callers pre-check paths that don't exist yet
 * (writeFile / mkdir targets). In that mode we walk up to the nearest
 * existing ancestor and check IT — the not-yet-existing tail can't be a
 * symlink to anything.
 *
 * Both sides go through `realpath` so OS-level symlink prefixes
 * (macOS's `/tmp` -> `/private/tmp`) don't cause false negatives.
 */
export async function assertWithinBackingDir(
  resolved: ResolvedPath,
  backingDir: string,
  opts: { missingOk?: boolean } = {}
): Promise<void> {
  // Ephemeral `/user/<token>` paths: the user picked the file
  // explicitly. We still realpath the file to confirm it exists,
  // but don't enforce a containment check against a backing dir —
  // the user's pick IS the boundary, and the file can live anywhere
  // they pointed at.
  if (resolved.isEphemeral) {
    const real = await safeRealpath(resolved.hostPath);
    if (real === null) {
      throw errors.fsNotFound({ path: resolved.virtualPath });
    }
    return;
  }
  const realBacking = (await safeRealpath(backingDir)) ?? backingDir;
  const real = opts.missingOk
    ? await realpathOrAncestor(resolved.hostPath)
    : await safeRealpath(resolved.hostPath);
  if (real === null) {
    throw errors.fsNotFound({ path: resolved.virtualPath });
  }
  if (!isWithin(real, realBacking)) {
    throw errors.fsSymlinkEscape({ path: resolved.virtualPath });
  }
}

async function safeRealpath(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch (e) {
    if (isEnoent(e)) {
      return null;
    }
    throw e;
  }
}

/**
 * Walk up to the nearest existing ancestor and return its realpath.
 * Used for ops that intentionally target a not-yet-existing path.
 */
async function realpathOrAncestor(path: string): Promise<string> {
  let current = path;
  // Cap the walk so a pathological input can't pin a CPU core.
  for (let i = 0; i < 100; i++) {
    const real = await safeRealpath(current);
    if (real !== null) {
      return real;
    }
    const parent = dirname(current);
    if (parent === current) {
      return current;
    }
    current = parent;
  }
  return current;
}

function isWithin(child: string, parent: string): boolean {
  if (child === parent) {
    return true;
  }
  return child.startsWith(parent + sep);
}

function isEnoent(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  return Reflect.get(error, 'code') === 'ENOENT';
}
