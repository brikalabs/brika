/**
 * `ctx.fs.writeFile` — write a file inside a virtual root.
 *
 * Pipeline: resolve virtual path → scope-check `write` → size cap
 * (per-call) → quota check (per-plugin) → symlink check on the
 * existing portion of the path → perform the write → update the
 * counter.
 *
 * `mode === 'create-new'` first stat's the path and throws
 * `FS_ALREADY_EXISTS` if anything exists; `'append'` keeps the
 * previous body and adds; `'overwrite'` (default) writes the file
 * from scratch.
 */

import { appendFile, stat, writeFile } from 'node:fs/promises';
import { errors } from '@brika/errors';
import { defineGrant } from '@brika/grants';
import {
  type FsScope,
  type FsWriteFileArgs,
  type FsWriteFileResult,
  fsWriteFile as spec,
} from '@brika/sdk/grants';
import { byteLength } from '../../net/byte-size';
import { backingDirFor, resolveVirtualPath } from '../paths';
import type { QuotaTracker } from '../quotas';
import { assertAccess } from '../scope';
import { assertWithinBackingDir } from '../symlinks';
import { DEFAULT_MAX_FILE_BYTES, type FsBackingDirs } from '../types';

export interface WriteFileDeps {
  readonly dirs: FsBackingDirs;
  readonly ephemeral?: import('../ephemeral').EphemeralRoots;
  readonly quotas: QuotaTracker;
  readonly maxFileBytes?: number;
}

export function buildWriteFileGrant(deps: WriteFileDeps) {
  const cap = deps.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  return defineGrant(spec.spec, async (ctx, args: FsWriteFileArgs): Promise<FsWriteFileResult> => {
    const scope: FsScope = ctx.grantedScope;
    const resolved = resolveVirtualPath(args.path, deps.dirs, deps.ephemeral);
    assertAccess(resolved, scope, 'write');
    const bytes = byteLength(args.content);
    if (bytes > cap) {
      throw errors.fsFileTooLarge({ limit: cap, requested: bytes });
    }
    // Symlink check tolerates non-existent tails — the target might
    // not exist yet (this is a write).
    await assertWithinBackingDir(resolved, backingDirFor(resolved, deps.dirs), {
      missingOk: true,
    });
    if (args.mode === 'create-new') {
      const exists = await pathExists(resolved.hostPath);
      if (exists) {
        throw errors.fsAlreadyExists({ path: resolved.virtualPath });
      }
    }
    const root = quotaRoot(resolved.root);
    // For append: quota only checks the delta. For overwrite /
    // create-new: subtract the existing size from the delta so a
    // same-size overwrite doesn't double-count.
    const previousSize = args.mode === 'append' ? 0 : await fileSizeOrZero(resolved.hostPath);
    const delta = bytes - previousSize;
    if (root !== null && delta > 0) {
      await deps.quotas.assertCanAdd(root, delta, deps.dirs);
    }
    if (args.mode === 'append') {
      await appendFile(resolved.hostPath, args.content);
    } else {
      await writeFile(resolved.hostPath, args.content);
    }
    if (root !== null && delta !== 0) {
      if (delta > 0) {
        deps.quotas.add(root, delta);
      } else {
        deps.quotas.subtract(root, -delta);
      }
    }
    return { bytesWritten: bytes };
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function fileSizeOrZero(path: string): Promise<number> {
  try {
    const info = await stat(path);
    return info.isFile() ? info.size : 0;
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
