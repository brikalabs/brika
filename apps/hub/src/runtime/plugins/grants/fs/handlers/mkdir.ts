/**
 * `ctx.fs.mkdir` — create a directory inside a virtual root.
 *
 * Symlink check uses `missingOk: true` because the target by
 * definition doesn't exist yet. `recursive: true` mirrors
 * `node:fs.mkdir({recursive: true})` — every intermediate dir is
 * created, no error if the leaf already exists.
 */

import { mkdir } from 'node:fs/promises';
import { defineGrant } from '@brika/grants';
import {
  type FsMkdirArgs,
  type FsMkdirResult,
  type FsScope,
  fsMkdir as spec,
} from '@brika/sdk/grants';
import { backingDirFor, resolveVirtualPath } from '../paths';
import { assertAccess } from '../scope';
import { assertWithinBackingDir } from '../symlinks';
import type { FsBackingDirs } from '../types';

export interface MkdirDeps {
  readonly dirs: FsBackingDirs;
  readonly ephemeral?: import('../ephemeral').EphemeralRoots;
}

export function buildMkdirGrant(deps: MkdirDeps) {
  return defineGrant(spec.spec, async (ctx, args: FsMkdirArgs): Promise<FsMkdirResult> => {
    const scope: FsScope = ctx.grantedScope;
    const resolved = resolveVirtualPath(args.path, deps.dirs, deps.ephemeral);
    assertAccess(resolved, scope, 'write');
    await assertWithinBackingDir(resolved, backingDirFor(resolved, deps.dirs), { missingOk: true });
    const created = await mkdir(resolved.hostPath, { recursive: args.recursive });
    return { created: created !== undefined };
  });
}
