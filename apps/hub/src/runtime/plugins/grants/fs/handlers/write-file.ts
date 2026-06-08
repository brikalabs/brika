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

import { appendFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
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

export interface StreamWriteFileDeps {
  readonly dirs: FsBackingDirs;
  readonly ephemeral?: import('../ephemeral').EphemeralRoots;
  readonly quotas: QuotaTracker;
  readonly maxFileBytes?: number;
}

export interface StreamWriteFileArgs {
  readonly scope: FsScope;
  readonly virtualPath: string;
  readonly body: ReadableStream<Uint8Array>;
  /** Client-declared size (Content-Length) for an early cap rejection. */
  readonly declaredBytes?: number;
}

/**
 * Streaming sibling of the `writeFile` grant (overwrite mode), for the hub's
 * stream-write action path. Runs the identical security pipeline — scope +
 * read-only check, symlink-escape guard, per-call size cap, per-plugin quota
 * — but pipes a `ReadableStream` straight to disk so the bytes never sit
 * buffered in memory (and never cross the IPC payload cap). Writes to a temp
 * sibling first, then atomically renames into place, so an aborted or
 * over-cap upload can never clobber an existing file or leak past quota.
 *
 * Takes the *same* `QuotaTracker` instance as `buildWriteFileGrant` (wired in
 * `plugin-process`), so streamed and buffered writes share one counter.
 */
export async function streamWriteFile(
  deps: StreamWriteFileDeps,
  args: StreamWriteFileArgs
): Promise<FsWriteFileResult> {
  const cap = deps.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const resolved = resolveVirtualPath(args.virtualPath, deps.dirs, deps.ephemeral);
  assertAccess(resolved, args.scope, 'write');
  if (args.declaredBytes !== undefined && args.declaredBytes > cap) {
    throw errors.fsFileTooLarge({ limit: cap, requested: args.declaredBytes });
  }
  await assertWithinBackingDir(resolved, backingDirFor(resolved, deps.dirs), { missingOk: true });

  const tempPath = `${resolved.hostPath}.brika-upload-${crypto.randomUUID()}`;
  let written: number;
  try {
    written = await streamToFileWithCap(args.body, tempPath, cap);
  } catch (err) {
    await unlink(tempPath).catch(() => undefined);
    throw err;
  }

  // Quota check before the file becomes real. Overwrite semantics: subtract
  // the previous size so a same-size replace doesn't double-count. If the
  // delta blows the quota, drop the temp and never publish.
  const root = quotaRoot(resolved.root);
  const previousSize = await fileSizeOrZero(resolved.hostPath);
  const delta = written - previousSize;
  if (root !== null && delta > 0) {
    try {
      await deps.quotas.assertCanAdd(root, delta, deps.dirs);
    } catch (err) {
      await unlink(tempPath).catch(() => undefined);
      throw err;
    }
  }

  await rename(tempPath, resolved.hostPath);
  if (root !== null && delta !== 0) {
    if (delta > 0) {
      deps.quotas.add(root, delta);
    } else {
      deps.quotas.subtract(root, -delta);
    }
  }
  return { bytesWritten: written };
}

/**
 * Pipe a stream to `destPath`, returning the byte count. Aborts (and lets the
 * caller clean up) the moment the running total exceeds `cap`, so an oversize
 * upload never fully lands on disk.
 */
async function streamToFileWithCap(
  body: ReadableStream<Uint8Array>,
  destPath: string,
  cap: number
): Promise<number> {
  const reader = body.getReader();
  const sink = Bun.file(destPath).writer();
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > cap) {
        throw errors.fsFileTooLarge({ limit: cap, requested: total });
      }
      sink.write(value);
    }
    await sink.end();
    return total;
  } catch (err) {
    // Best-effort flush/close; surface the original failure.
    try {
      await sink.end();
    } catch {
      // ignore
    }
    throw err;
  }
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
