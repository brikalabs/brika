/**
 * Virtual-path → host-path resolution.
 *
 * Five steps, in order:
 *   1. The string must start with a known virtual root (`/bundle`, `/data`,
 *      `/cache`, `/tmp`). Anything else is rejected before any IO.
 *   2. POSIX-style normalisation collapses `.` and `..` segments. After
 *      this step the path must STILL start with the virtual root —
 *      `/data/../etc` normalises to `/etc` which has no virtual root
 *      and so is rejected.
 *   3. Map the virtual root to the backing host directory.
 *   4. Join the host directory with the rest of the virtual path.
 *   5. (Performed elsewhere, after a probe is made) `realpath` the host
 *      path and verify it's still inside the backing dir — closes the
 *      symlink-escape vector.
 *
 * Pure module: no fs IO, no async. The realpath check is in
 * `symlinks.ts` because it needs to read the filesystem.
 */

import { join, normalize as nodeNormalize, posix, sep } from 'node:path';
import { errors } from '@brika/errors';
import { VIRTUAL_ROOTS, type VirtualRoot } from '@brika/sdk/grants';
import type { EphemeralRoots } from './ephemeral';
import type { FsBackingDirs, ResolvedPath } from './types';

/**
 * Parse a virtual path and produce a `ResolvedPath`. Throws
 * `FS_PATH_OUTSIDE_ROOT` for inputs that escape the virtual roots.
 *
 * The check is purely string-level — symlinks are resolved later.
 *
 * `/user/<token>/...` paths consult the optional `EphemeralRoots`
 * registry: if a token was minted by `ctx.ui.pickFile`, the resolver
 * returns a host path pointing at the file the user picked. Without
 * the registry argument, every `/user/...` path is rejected.
 */
export function resolveVirtualPath(
  virtualPath: string,
  dirs: FsBackingDirs,
  ephemeral?: EphemeralRoots
): ResolvedPath {
  if (!virtualPath.startsWith('/')) {
    throw errors.fsPathOutsideRoot({ path: virtualPath });
  }
  // NUL byte defence: the schema already rejects these on the wire,
  // but this module is reachable directly from tests and future
  // callers, so we keep the check local too. NUL would otherwise
  // truncate the path mid-string in the kernel call.
  if (virtualPath.includes('\0')) {
    throw errors.fsPathOutsideRoot({ path: virtualPath });
  }
  // POSIX normalisation on the virtual path. We use posix.normalize so
  // the same input behaves identically on macOS and Linux (no Windows
  // drive-letter quirks ever in the virtual world).
  const normalized = posix.normalize(virtualPath);
  if (normalized.startsWith('..') || normalized === '/' || !normalized.startsWith('/')) {
    throw errors.fsPathOutsideRoot({ path: virtualPath });
  }
  // /user/<token>/... lives in a per-pick ephemeral registry; resolution
  // happens BEFORE the named-root check because the host path may live
  // anywhere on disk (the user picked it). The returned `ResolvedPath`
  // is flagged `isEphemeral` so the scope check and symlink guard can
  // treat it specially.
  if (normalized.startsWith('/user/')) {
    if (!ephemeral) {
      throw errors.fsPathOutsideRoot({ path: virtualPath });
    }
    const hostPath = ephemeral.resolve(normalized);
    if (hostPath === null) {
      throw errors.fsPathOutsideRoot({ path: virtualPath });
    }
    return {
      virtualPath: normalized,
      hostPath: nodeNormalize(hostPath),
      // `root` is required by the type; `/bundle` is the closest
      // sandboxed-read parallel, but the `isEphemeral` flag below is
      // what callers actually branch on.
      root: '/bundle',
      readOnly: true,
      isEphemeral: true,
    };
  }
  const root = pickRoot(normalized);
  if (root === null) {
    throw errors.fsPathOutsideRoot({ path: virtualPath });
  }
  // The remainder is everything after the root prefix. Strip the
  // leading `/` so `path.join(dir, '')` doesn't reset to the dir root.
  const remainder = normalized.slice(root.length).replace(/^\/+/, '');
  const hostPath = remainder === '' ? rootDir(root, dirs) : join(rootDir(root, dirs), remainder);
  return {
    virtualPath: normalized,
    hostPath: nodeNormalize(hostPath),
    root,
    readOnly: root === '/bundle',
  };
}

function pickRoot(normalized: string): VirtualRoot | null {
  for (const root of VIRTUAL_ROOTS) {
    if (normalized === root || normalized.startsWith(`${root}/`)) {
      return root;
    }
  }
  return null;
}

function rootDir(root: VirtualRoot, dirs: FsBackingDirs): string {
  switch (root) {
    case '/bundle':
      return dirs.bundle;
    case '/data':
      return dirs.data;
    case '/cache':
      return dirs.cache;
    case '/tmp':
      return dirs.tmp;
  }
}

/** Used by the symlink check: returns the backing dir for a resolved path. */
export function backingDirFor(resolved: ResolvedPath, dirs: FsBackingDirs): string {
  return rootDir(resolved.root, dirs);
}

/**
 * Test guard: a host path lives inside the backing dir iff its
 * realpath starts with the backing dir + path separator (or equals it
 * exactly).
 */
export function isWithinBackingDir(hostPath: string, backingDir: string): boolean {
  if (hostPath === backingDir) {
    return true;
  }
  return hostPath.startsWith(backingDir + sep);
}
