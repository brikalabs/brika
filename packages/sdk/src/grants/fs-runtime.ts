/**
 * `BrikaFsRuntime` — the runtime contract for `globalThis.__brika_fs`.
 *
 * Three consumers reference this interface:
 *   - the hub's prelude FS proxy
 *     (`apps/hub/src/runtime/plugins/prelude/proxies/fs-runtime.ts`),
 *     which builds the implementation;
 *   - the hub's `Bun.file` proxy, which delegates to the same runtime;
 *   - the compile-time `node:fs/promises` shim in
 *     `packages/compiler/src/runtime/`, which translates Node-style
 *     calls into runtime calls.
 *
 * The interface is intentionally pinned with inline value shapes (no
 * `z.infer`) so this file is import-safe from any package without
 * dragging in `zod`, the grant specs, or the `Ctx` module
 * augmentation. The compiler in particular bundles plugin code that
 * cannot afford to pull the full SDK graph through its typecheck.
 *
 * The shapes here MUST stay in sync with the Zod schemas in `./fs`.
 * That synchronisation is enforced structurally: `./fs` exports
 * `BrikaFsRuntime` from this file, and the `Ctx['fs']` augmentation
 * (also in `./fs`) references the same type, so any drift between the
 * schemas and the runtime contract surfaces at typecheck time on the
 * grant spec.
 */

export interface BrikaFsRuntime {
  readFile(args: {
    path: string;
    encoding: 'utf-8' | 'binary';
  }): Promise<{ encoding: 'utf-8'; content: string } | { encoding: 'binary'; content: Uint8Array }>;
  writeFile(args: {
    path: string;
    content: string | Uint8Array;
    mode: 'overwrite' | 'append' | 'create-new';
  }): Promise<{ bytesWritten: number }>;
  readdir(args: { path: string; recursive: boolean }): Promise<{
    entries: Array<{
      name: string;
      isFile: boolean;
      isDirectory: boolean;
      isSymlink: boolean;
      /** File size in bytes. `0` for directories and symlinks. */
      size: number;
      /** Last-modified time as Unix epoch milliseconds. `0` if unknown. */
      mtime: number;
    }>;
  }>;
  stat(args: { path: string }): Promise<{
    size: number;
    mtimeMs: number;
    isFile: boolean;
    isDirectory: boolean;
    isSymlink: boolean;
  }>;
  mkdir(args: { path: string; recursive: boolean }): Promise<{ created: boolean }>;
  rm(args: { path: string; recursive: boolean; force: boolean }): Promise<{ removed: boolean }>;
  exists(args: { path: string }): Promise<{ exists: boolean }>;
}
