/**
 * `ctx.fs.exists` — boolean probe for a virtual path.
 *
 * Scope check applies (a plugin shouldn't enumerate paths it can't
 * read). Symlink check applies too: an existing symlink that points
 * outside the backing dir reports `exists: false` rather than
 * accidentally revealing host structure via a thrown error message.
 */

import { realpath, stat } from 'node:fs/promises';
import { defineGrant } from '@brika/grants';
import {
  type FsExistsArgs,
  type FsExistsResult,
  type FsScope,
  fsExists as spec,
} from '@brika/sdk/grants';
import { backingDirFor, isWithinBackingDir, resolveVirtualPath } from '../paths';
import { assertAccess } from '../scope';
import type { FsBackingDirs } from '../types';

export interface ExistsDeps {
  readonly dirs: FsBackingDirs;
}

export function buildExistsGrant(deps: ExistsDeps) {
  return defineGrant(spec.spec, async (ctx, args: FsExistsArgs): Promise<FsExistsResult> => {
    const scope: FsScope = ctx.grantedScope;
    const resolved = resolveVirtualPath(args.path, deps.dirs);
    assertAccess(resolved, scope, 'read');
    try {
      await stat(resolved.hostPath);
    } catch {
      return { exists: false };
    }
    // Resolve symlinks to confirm the target stays in-sandbox before
    // reporting `exists: true`. A link pointing outside reports
    // `exists: false` — same security stance as if the file didn't
    // exist at all. Both sides go through realpath so macOS's
    // /tmp -> /private/tmp symlink doesn't cause false negatives.
    try {
      const real = await realpath(resolved.hostPath);
      const backing = backingDirFor(resolved, deps.dirs);
      const realBacking = await realpath(backing).catch(() => backing);
      return { exists: isWithinBackingDir(real, realBacking) };
    } catch {
      return { exists: false };
    }
  });
}
