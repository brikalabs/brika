/**
 * `ctx.fs.*` grant family — hub-side composition.
 *
 * Each handler lives in `handlers/<name>.ts`; this file gathers them
 * into one `buildFsGrants(opts)` that the registry-factory plugs into
 * `buildHubGrants`.
 *
 * Per-plugin state — the `QuotaTracker` instance — lives in the
 * returned closure so two plugins never share quota counters.
 */

import type { Grant } from '@brika/grants';
import { EphemeralRoots } from './ephemeral';
import { buildExistsGrant } from './handlers/exists';
import { buildMkdirGrant } from './handlers/mkdir';
import { buildReadFileGrant } from './handlers/read-file';
import { buildReaddirGrant } from './handlers/readdir';
import { buildRmGrant } from './handlers/rm';
import { buildStatGrant } from './handlers/stat';
import { buildWriteFileGrant } from './handlers/write-file';
import { QuotaTracker } from './quotas';
import { DEFAULT_FS_QUOTAS, type FsBackingDirs, type FsQuotas } from './types';

export { EphemeralRoots } from './ephemeral';
export type { FsBackingDirs, FsQuotas } from './types';

export interface FsGrantOptions {
  /**
   * Per-plugin backing directories — the host paths each virtual
   * root maps to. Tests pass temp dirs; production wires the
   * plugin's data/cache/tmp/install dirs from operator config.
   */
  readonly dirs: FsBackingDirs;
  /** Per-root byte quotas. Defaults to `DEFAULT_FS_QUOTAS`. */
  readonly quotas?: FsQuotas;
  /** Per-call body cap for readFile/writeFile. Defaults to 50 MiB. */
  readonly maxFileBytes?: number;
  /** Per-call entry cap for readdir. Defaults to 10 000. */
  readonly maxDirEntries?: number;
  /**
   * Ephemeral root registry. Shared with the `ui` grants so a
   * `ctx.ui.pickFile` call can mint a token that the same plugin's
   * subsequent `ctx.fs.readFile('/user/<token>/...')` can resolve.
   * Omit to disable `/user/*` paths entirely (every such read
   * throws `FS_PATH_OUTSIDE_ROOT`).
   */
  readonly ephemeral?: EphemeralRoots;
}

export function buildFsGrants(opts: FsGrantOptions): ReadonlyArray<Grant> {
  const quotas = new QuotaTracker(opts.quotas ?? DEFAULT_FS_QUOTAS);
  const ephemeral = opts.ephemeral;
  return [
    buildReadFileGrant({ dirs: opts.dirs, ephemeral, maxFileBytes: opts.maxFileBytes }),
    buildWriteFileGrant({ dirs: opts.dirs, ephemeral, quotas, maxFileBytes: opts.maxFileBytes }),
    buildReaddirGrant({ dirs: opts.dirs, ephemeral, maxEntries: opts.maxDirEntries }),
    buildStatGrant({ dirs: opts.dirs, ephemeral }),
    buildMkdirGrant({ dirs: opts.dirs, ephemeral }),
    buildRmGrant({ dirs: opts.dirs, ephemeral, quotas }),
    buildExistsGrant({ dirs: opts.dirs, ephemeral }),
  ];
}
