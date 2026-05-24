/**
 * Bun.build plugin that redirects `node:os` imports to Brika's sanitised
 * shim. Thin specialisation over `createNodeBuiltinShimPlugin` — see
 * that file for the rationale.
 */

import { fileURLToPath } from 'node:url';
import type { BunPlugin } from 'bun';
import { createNodeBuiltinShimPlugin } from './node-builtin-shim';

const SHIM_PATH = fileURLToPath(new URL('../runtime/node-os-shim.ts', import.meta.url));

export function nodeOsShimPlugin(): BunPlugin {
  return createNodeBuiltinShimPlugin({
    pluginName: 'brika-node-os-shim',
    module: 'os',
    shimPath: SHIM_PATH,
  });
}

/** Exported for tests that want to assert the resolved shim location. */
export function getNodeOsShimPath(): string {
  return SHIM_PATH;
}
