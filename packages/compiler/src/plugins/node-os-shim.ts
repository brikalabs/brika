/**
 * Bun.build plugin that redirects `node:os` imports to Brika's sanitised
 * shim.
 *
 * Why build-time (not runtime): Bun's Bun.plugin().onResolve hook doesn't
 * fire for bare specifiers like `import os from 'node:os'` issued from
 * plugin source — those resolve through Bun's C++ module table. Catching
 * the rewrite at build time, when the bundler resolves every import in
 * the plugin's source graph, is the reliable point.
 *
 * The shim lives at a path resolvable from this file via
 * `import.meta.url`; it gets inlined into the plugin bundle so the
 * runtime `node:os` is never touched. The lockdown's deny-list stays
 * in place to catch dynamic-import escape attempts like
 * `await import('node:' + 'os')`.
 */

import { fileURLToPath } from 'node:url';
import type { BunPlugin } from 'bun';

/** Resolved absolute path to the shim source file. */
const SHIM_PATH = fileURLToPath(new URL('../runtime/node-os-shim.ts', import.meta.url));

/**
 * Built-in modules in Bun's bundler are resolved by the C++ layer
 * BEFORE any JS-side `onResolve` plugin fires. Trying to intercept
 * `node:os` through a normal resolve hook produces no effect — Bun
 * silently routes the import to its real implementation. The reliable
 * way to substitute the import is to rewrite the source text BEFORE
 * the bundler sees it: `onLoad` on `.ts`/`.tsx` files, regex-replace
 * the import specifier with an absolute path to our shim, return the
 * transformed source. The bundler then resolves the new path normally
 * and our shim's body gets inlined.
 *
 * Regex matches both `from 'node:os'` and `from "node:os"`, and also
 * the side-effect form `import 'node:os'`. We deliberately don't try
 * to rewrite `require('node:os')` — plugin sources are ESM-only.
 */
const NODE_OS_IMPORT_REGEX = /(from\s*)(['"])node:os\2/g;
const NODE_OS_SIDE_EFFECT_REGEX = /(import\s*)(['"])node:os\2/g;

export function nodeOsShimPlugin(): BunPlugin {
  // Pre-build the replacement once. `SHIM_PATH` is absolute and contains
  // no special characters that need escaping in a JS string literal.
  const replacement = `'${SHIM_PATH}'`;
  return {
    name: 'brika-node-os-shim',
    setup(build) {
      build.onLoad({ filter: /\.[tj]sx?$/ }, async (args) => {
        const original = await Bun.file(args.path).text();
        if (!original.includes('node:os')) {
          return undefined;
        }
        const rewritten = original
          .replace(NODE_OS_IMPORT_REGEX, `$1${replacement}`)
          .replace(NODE_OS_SIDE_EFFECT_REGEX, `$1${replacement}`);
        if (rewritten === original) {
          return undefined;
        }
        return { contents: rewritten, loader: pickLoader(args.path) };
      });
    },
  };
}

/** Exported for tests that want to assert the resolved shim location. */
export function getNodeOsShimPath(): string {
  return SHIM_PATH;
}

type Loader = 'tsx' | 'ts' | 'jsx' | 'js';

function pickLoader(path: string): Loader {
  if (path.endsWith('.tsx')) {
    return 'tsx';
  }
  if (path.endsWith('.ts')) {
    return 'ts';
  }
  if (path.endsWith('.jsx')) {
    return 'jsx';
  }
  return 'js';
}
