/**
 * `ctx.fs.readFile` — read a file from a virtual root.
 *
 * Pipeline: resolve virtual path → scope-check `read` → realpath +
 * within-backing-dir check → stat for size cap → read bytes → decode
 * (utf-8) or return raw (binary).
 */

import { readFile, stat } from 'node:fs/promises';
import { errors } from '@brika/errors';
import { defineGrant } from '@brika/grants';
import {
  type FsReadFileArgs,
  type FsReadFileResult,
  type FsScope,
  fsReadFile as spec,
} from '@brika/sdk/grants';
import { backingDirFor, resolveVirtualPath } from '../paths';
import { assertAccess } from '../scope';
import { assertWithinBackingDir } from '../symlinks';
import { DEFAULT_MAX_FILE_BYTES, type FsBackingDirs } from '../types';

export interface ReadFileDeps {
  readonly dirs: FsBackingDirs;
  readonly maxFileBytes?: number;
}

export function buildReadFileGrant(deps: ReadFileDeps) {
  const cap = deps.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  return defineGrant(spec.spec, async (ctx, args: FsReadFileArgs): Promise<FsReadFileResult> => {
    const scope: FsScope = ctx.grantedScope;
    const resolved = resolveVirtualPath(args.path, deps.dirs);
    assertAccess(resolved, scope, 'read');
    await assertWithinBackingDir(resolved, backingDirFor(resolved, deps.dirs));
    const info = await stat(resolved.hostPath);
    if (info.size > cap) {
      throw errors.fsFileTooLarge({ limit: cap, requested: info.size });
    }
    if (args.encoding === 'utf-8') {
      const content = await readFile(resolved.hostPath, 'utf-8');
      return { encoding: 'utf-8', content };
    }
    const buf = await readFile(resolved.hostPath);
    return { encoding: 'binary', content: new Uint8Array(buf) };
  });
}
