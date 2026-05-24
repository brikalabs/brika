/**
 * Bun.build plugin that rewrites `node:fs/promises` (and the bare
 * `fs/promises` form Bun emits in some shapes) imports to Brika's
 * sandboxed shim. Thin specialisation over `createNodeBuiltinShimPlugin`.
 *
 * `node:fs` (sync) is NOT rewritten — it stays denied. Plugins that
 * imported the sync variants need to migrate to the promise API.
 */

import { fileURLToPath } from 'node:url';
import type { BunPlugin } from 'bun';
import { createNodeBuiltinShimPlugin } from './node-builtin-shim';

const SHIM_PATH = fileURLToPath(new URL('../runtime/node-fs-promises-shim.ts', import.meta.url));

export function nodeFsShimPlugin(): BunPlugin {
  return createNodeBuiltinShimPlugin({
    pluginName: 'brika-node-fs-shim',
    module: 'fs/promises',
    shimPath: SHIM_PATH,
    alsoRewriteBare: true,
  });
}

export function getNodeFsShimPath(): string {
  return SHIM_PATH;
}
