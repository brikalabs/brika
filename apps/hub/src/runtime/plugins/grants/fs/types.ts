/**
 * Internal types + defaults for the `fs` grant family.
 *
 * Public types (`FsScope`, `FsReadFileArgs`, …) live in
 * `@brika/sdk/grants/fs`. This module covers hub-private wiring: virtual
 * root configuration, default quotas, the resolved-path bag the
 * handlers pass around.
 */

import type { VirtualRoot } from '@brika/sdk/grants';

/**
 * Per-plugin filesystem configuration. The hub wires this when the
 * registry is built; each backing dir is the absolute host path the
 * virtual root maps to.
 *
 * Tests pass a temporary set of dirs; production wiring lives in
 * `plugin-lifecycle.ts` and reads the plugin's data/cache/tmp dirs
 * from the operator config.
 */
export interface FsBackingDirs {
  readonly bundle: string;
  readonly data: string;
  readonly cache: string;
  readonly tmp: string;
}

/** Mode-by-root quota in bytes. Defaults below; operators may override. */
export interface FsQuotas {
  readonly data: number;
  readonly cache: number;
  readonly tmp: number;
}

/** 100 MiB / 500 MiB / 100 MiB feels right for a typical desktop plugin. */
export const DEFAULT_FS_QUOTAS: FsQuotas = {
  data: 100 * 1024 * 1024,
  cache: 500 * 1024 * 1024,
  tmp: 100 * 1024 * 1024,
};

/** Per-call body cap. Streamed reads land in v2; for now we buffer. */
export const DEFAULT_MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Cap on the number of entries returned from a single `readdir`. */
export const DEFAULT_MAX_DIR_ENTRIES = 10_000;

/**
 * Resolved view of a virtual path. Once we get one of these, every
 * subsequent op uses the `hostPath` for actual IO and `virtualPath`
 * for scope checks / error messages.
 */
export interface ResolvedPath {
  readonly virtualPath: string;
  readonly hostPath: string;
  readonly root: VirtualRoot;
  /** True iff the virtual root is read-only (`/bundle`). */
  readonly readOnly: boolean;
}
