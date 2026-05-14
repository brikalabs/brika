/// <reference path="./react-refresh.d.ts" />
/**
 * Bun loader plugin: instrument `.tsx` files with React Fast Refresh
 * for the FIRST load via SWC. Hot-reload re-execution is driven by
 * the watcher in `preload.ts`; this plugin only ensures every
 * component reaches the live tree pre-tagged with a stable family id.
 *
 * SWC does TS strip + JSX → `_jsx` + `$RefreshReg$`/`$RefreshSig$`
 * instrumentation in a single native pass — order of magnitude
 * faster than the Babel pipeline this replaced.
 *
 * Also stubs `react-devtools-core` (Ink imports it when DEV=true).
 */

import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import type { BunPlugin } from 'bun';
import { transform as swcTransform } from '@swc/core';
import { wrapWithRefresh } from './wrap';

interface PluginOptions {
  /** Anchor for module ids. Defaults to `process.cwd()`. */
  readonly rootDir?: string;
  /**
   * URL of the runtime module emitted into every transformed file's
   * import line. Defaults to `@brika/tui/refresh/runtime`; preloads
   * pass an absolute `file://` URL so the import resolves from any
   * workspace package.
   */
  readonly runtimeImport?: string;
}

export function createRefreshPlugin(options: PluginOptions = {}): BunPlugin {
  const rootDir = options.rootDir ?? process.cwd();
  const runtimeImport = options.runtimeImport ?? '@brika/tui/refresh/runtime';

  return {
    name: 'brika-refresh',
    setup(build) {
      build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
        path: 'react-devtools-core',
        namespace: 'brika-stub',
      }));
      build.onLoad({ filter: /.*/, namespace: 'brika-stub' }, () => ({
        contents: 'export default { initialize() {}, connectToDevTools() {} };',
        loader: 'js',
      }));

      build.onLoad({ filter: /\.tsx$/ }, async (args) => {
        const source = await readFile(args.path, 'utf8');
        if (shouldSkip(args.path)) {
          return { contents: source, loader: 'tsx' };
        }

        const result = await swcTransform(source, {
          filename: args.path,
          sourceMaps: 'inline',
          jsc: {
            parser: { syntax: 'typescript', tsx: true },
            target: 'es2022',
            transform: {
              react: {
                runtime: 'automatic',
                development: true,
                refresh: true,
              },
            },
          },
        });
        if (!result.code) {
          return { contents: source, loader: 'tsx' };
        }

        const moduleId = relative(rootDir, args.path) || args.path;
        return {
          contents: wrapWithRefresh(result.code, moduleId, runtimeImport),
          // SWC already compiled JSX → `_jsx` calls, so we hand Bun
          // plain JS (no JSX loader needed).
          loader: 'js',
        };
      });
    },
  };
}

/**
 * Skip third-party code, test files, and the refresh subdir itself.
 * Instrumenting node_modules would explode startup time; instrumenting
 * our own refresh code would create circular re-entry.
 */
function shouldSkip(path: string): boolean {
  return (
    path.includes('/node_modules/') ||
    path.endsWith('.test.tsx') ||
    path.includes('/packages/tui/src/refresh/')
  );
}
