/**
 * `ctx.fs.rm` — remove a file or directory inside a virtual root.
 *
 * Decrements the per-plugin quota counter by the size of what was
 * removed (best-effort via a stat pre-pass; if the stat fails we
 * skip the decrement and recover next time the counter is rebuilt).
 */

import { rm, stat } from 'node:fs/promises';
import { defineGrant } from '@brika/grants';
import { type FsRmArgs, type FsRmResult, type FsScope, fsRm as spec } from '@brika/sdk/grants';
import { backingDirFor, resolveVirtualPath } from '../paths';
import type { QuotaTracker } from '../quotas';
import { scanDirSize } from '../quotas';
import { assertAccess } from '../scope';
import { assertWithinBackingDir } from '../symlinks';
import type { FsBackingDirs } from '../types';

export interface RmDeps {
  readonly dirs: FsBackingDirs;
  readonly quotas: QuotaTracker;
}

export function buildRmGrant(deps: RmDeps) {
  return defineGrant(spec.spec, async (ctx, args: FsRmArgs): Promise<FsRmResult> => {
    const scope: FsScope = ctx.grantedScope;
    const resolved = resolveVirtualPath(args.path, deps.dirs);
    assertAccess(resolved, scope, 'write');
    await assertWithinBackingDir(resolved, backingDirFor(resolved, deps.dirs), { missingOk: true });
    const pre = await measure(resolved.hostPath);
    await rm(resolved.hostPath, { recursive: args.recursive, force: args.force });
    if (pre > 0) {
      const root = quotaRoot(resolved.root);
      if (root !== null) {
        deps.quotas.subtract(root, pre);
      }
    }
    return { removed: true };
  });
}

async function measure(hostPath: string): Promise<number> {
  try {
    const info = await stat(hostPath);
    if (info.isFile()) {
      return info.size;
    }
    if (info.isDirectory()) {
      return await scanDirSize(hostPath);
    }
    return 0;
  } catch {
    return 0;
  }
}

function quotaRoot(root: '/bundle' | '/data' | '/cache' | '/tmp'): 'data' | 'cache' | 'tmp' | null {
  switch (root) {
    case '/data':
      return 'data';
    case '/cache':
      return 'cache';
    case '/tmp':
      return 'tmp';
    case '/bundle':
      return null;
  }
}
