/**
 * Bun.build plugin that rewrites `node:fs/promises` imports to Brika's
 * sandboxed shim.
 *
 * Same mechanism as `node-os-shim.ts`: source-level `onLoad` rewrite
 * because the bundler's `onResolve` doesn't fire for `node:` bare
 * specifiers. Matches:
 *   - `from 'node:fs/promises'`
 *   - `from 'fs/promises'` (Bun normalises `node:` to bare on output)
 *   - `import 'node:fs/promises'` (side-effect form)
 *
 * `node:fs` (sync) is NOT rewritten — it stays denied. Plugins that
 * imported the sync variants need to migrate to the promise API.
 */

import { fileURLToPath } from 'node:url';
import type { BunPlugin } from 'bun';

const SHIM_PATH = fileURLToPath(new URL('../runtime/node-fs-promises-shim.ts', import.meta.url));

const FROM_REGEX = /(from\s*)(['"])(?:node:)?fs\/promises\2/g;
const SIDE_EFFECT_REGEX = /(import\s*)(['"])(?:node:)?fs\/promises\2/g;

export function nodeFsShimPlugin(): BunPlugin {
  const replacement = `'${SHIM_PATH}'`;
  return {
    name: 'brika-node-fs-shim',
    setup(build) {
      build.onLoad({ filter: /\.[tj]sx?$/ }, async (args) => {
        const original = await Bun.file(args.path).text();
        if (!original.includes('fs/promises')) {
          return undefined;
        }
        const rewritten = original
          .replace(FROM_REGEX, `$1${replacement}`)
          .replace(SIDE_EFFECT_REGEX, `$1${replacement}`);
        if (rewritten === original) {
          return undefined;
        }
        return { contents: rewritten, loader: pickLoader(args.path) };
      });
    },
  };
}

export function getNodeFsShimPath(): string {
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
