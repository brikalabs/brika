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
import type { PluginBuildTransform } from './compose';
import { createNodeBuiltinShimPlugin, rewriteNodeBuiltinImports } from './node-builtin-shim';

const SHIM_PATH = fileURLToPath(new URL('../runtime/node-fs-promises-shim.ts', import.meta.url));

/** Composable transform — preferred entry point; used by `composeTransforms`. */
export function nodeFsShimTransform(): PluginBuildTransform {
  return {
    name: 'brika-node-fs-shim',
    transform(content) {
      return rewriteNodeBuiltinImports(content, {
        module: 'fs/promises',
        shimPath: SHIM_PATH,
        alsoRewriteBare: true,
      });
    },
  };
}

/** Standalone BunPlugin wrapper — retained for direct unit tests. */
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
