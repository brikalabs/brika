/**
 * `ctx.fs.stat` — metadata for a virtual path.
 *
 * Uses `lstat` so a plugin can see a symlink as-is rather than what
 * it points to. Following would still be safe (the symlink check
 * blocks escape), but seeing the link itself is more useful for code
 * that branches on `isSymlink`.
 */

import { lstat } from 'node:fs/promises';
import { errors } from '@brika/errors';
import { defineGrant } from '@brika/grants';
import {
  type FsScope,
  type FsStatArgs,
  type FsStatResult,
  fsStat as spec,
} from '@brika/sdk/grants';
import { backingDirFor, resolveVirtualPath } from '../paths';
import { assertAccess } from '../scope';
import { assertWithinBackingDir } from '../symlinks';
import type { FsBackingDirs } from '../types';

export interface StatDeps {
  readonly dirs: FsBackingDirs;
  readonly ephemeral?: import('../ephemeral').EphemeralRoots;
}

export function buildStatGrant(deps: StatDeps) {
  return defineGrant(spec.spec, async (ctx, args: FsStatArgs): Promise<FsStatResult> => {
    const scope: FsScope = ctx.grantedScope;
    const resolved = resolveVirtualPath(args.path, deps.dirs, deps.ephemeral);
    assertAccess(resolved, scope, 'read');
    await assertWithinBackingDir(resolved, backingDirFor(resolved, deps.dirs));
    try {
      const info = await lstat(resolved.hostPath);
      return {
        size: info.size,
        mtimeMs: Math.floor(info.mtimeMs),
        isFile: info.isFile(),
        isDirectory: info.isDirectory(),
        isSymlink: info.isSymbolicLink(),
      };
    } catch (e) {
      if (isEnoent(e)) {
        throw errors.fsNotFound({ path: resolved.virtualPath });
      }
      throw e;
    }
  });
}

function isEnoent(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  return Reflect.get(error, 'code') === 'ENOENT';
}
