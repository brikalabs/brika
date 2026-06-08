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

/**
 * Per-plugin disk quotas. `/data` is the primary user-facing store
 * (file browser, plugin databases, generated content); `/cache` is
 * evictable; `/tmp` is for short-lived working copies.
 *
 * Defaults sized for media-capable plugins on a single-tenant hub —
 * raise or lower per-plugin via the lifecycle config when running a
 * tighter multi-tenant deployment.
 */
export const DEFAULT_FS_QUOTAS: FsQuotas = {
  data: 2 * 1024 * 1024 * 1024,
  cache: 2 * 1024 * 1024 * 1024,
  tmp: 256 * 1024 * 1024,
};

/**
 * Merge a plugin's declared per-root quotas (from package.json
 * `resources.fs.quotas`) with the hub defaults — each omitted root falls
 * back to {@link DEFAULT_FS_QUOTAS}. Shared by the grant registry (enforcement)
 * and the disk-usage endpoint (display) so both report the same limits.
 */
export function resolveFsQuotas(quotas?: Partial<FsQuotas>): FsQuotas {
  return {
    data: quotas?.data ?? DEFAULT_FS_QUOTAS.data,
    cache: quotas?.cache ?? DEFAULT_FS_QUOTAS.cache,
    tmp: quotas?.tmp ?? DEFAULT_FS_QUOTAS.tmp,
  };
}

/**
 * Per-call body cap on `readFile` / `writeFile`. Streamed reads land
 * in v2; for now we buffer the whole payload in memory, so this cap
 * is also the practical upload size for plugin file actions. Raised
 * from 50 MiB → 256 MiB so the playground file-browser handles
 * routine photo/video uploads without a 413/grant-error. The
 * `dev.brika.fs.writeFile` schema's wire-level guard sits above this
 * (see [packages/sdk/src/grants/fs.ts](../../../../../packages/sdk/src/grants/fs.ts)).
 */
export const DEFAULT_MAX_FILE_BYTES = 256 * 1024 * 1024;

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
  /** True iff the virtual root is read-only (`/bundle` or `/user`). */
  readonly readOnly: boolean;
  /**
   * True for `/user/<token>/...` paths minted by `ctx.ui.pickFile`.
   * Ephemeral paths bypass the named-root scope rules: they require
   * an explicit `/user/**` read pattern in scope, and they skip the
   * within-backing-dir symlink check (the user's pick IS the
   * boundary).
   */
  readonly isEphemeral?: true;
}
