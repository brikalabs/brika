/**
 * `ctx.fs.readdir` — list entries in a virtual-root directory.
 *
 * Entry count is capped to prevent OOM via enumeration of a poisoned
 * directory. Recursive mode walks subtrees (subject to the same cap).
 * Each entry's `isFile`/`isDirectory`/`isSymlink` come from `lstat`
 * (we don't follow symlinks for listing).
 */

import { lstat, readdir } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { errors } from '@brika/errors';
import { defineGrant } from '@brika/grants';
import {
  type FsDirEntry,
  type FsReaddirArgs,
  type FsReaddirResult,
  type FsScope,
  fsReaddir as spec,
} from '@brika/sdk/grants';
import { backingDirFor, resolveVirtualPath } from '../paths';
import { assertAccess } from '../scope';
import { assertWithinBackingDir } from '../symlinks';
import { DEFAULT_MAX_DIR_ENTRIES, type FsBackingDirs } from '../types';

export interface ReaddirDeps {
  readonly dirs: FsBackingDirs;
  readonly maxEntries?: number;
}

export function buildReaddirGrant(deps: ReaddirDeps) {
  const cap = deps.maxEntries ?? DEFAULT_MAX_DIR_ENTRIES;
  return defineGrant(spec.spec, async (ctx, args: FsReaddirArgs): Promise<FsReaddirResult> => {
    const scope: FsScope = ctx.grantedScope;
    const resolved = resolveVirtualPath(args.path, deps.dirs);
    assertAccess(resolved, scope, 'read');
    await assertWithinBackingDir(resolved, backingDirFor(resolved, deps.dirs));
    const entries: FsDirEntry[] = [];
    await walk(resolved.hostPath, '', args.recursive, entries, cap);
    return { entries };
  });
}

async function walk(
  hostDir: string,
  relativePrefix: string,
  recursive: boolean,
  out: FsDirEntry[],
  cap: number
): Promise<void> {
  const names = await readdir(hostDir);
  for (const name of names) {
    if (out.length >= cap) {
      throw errors.fsFileTooLarge({ limit: cap, requested: cap + 1 });
    }
    const hostPath = join(hostDir, name);
    const stat = await lstat(hostPath);
    const relName = relativePrefix === '' ? name : posix.join(relativePrefix, name);
    const entry: FsDirEntry = {
      name: relName,
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
      isSymlink: stat.isSymbolicLink(),
    };
    out.push(entry);
    if (recursive && stat.isDirectory() && !stat.isSymbolicLink()) {
      await walk(hostPath, relName, true, out, cap);
    }
  }
}
