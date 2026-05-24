/**
 * Shared factory for Bun.build plugins that rewrite `node:<name>` (and
 * the bare `<name>` form Bun emits in some shapes) imports to point at
 * a Brika runtime shim path.
 *
 * Why build-time (not runtime): Bun's `Bun.plugin().onResolve` hook
 * doesn't fire for bare `node:` specifiers — those resolve through Bun's
 * C++ module table BEFORE any JS-side resolve plugin runs. Catching the
 * rewrite at build time, when the bundler resolves every import in the
 * plugin's source graph, is the reliable point.
 *
 * The shim path is inlined into the plugin bundle so the runtime
 * `node:<name>` is never touched. The lockdown's deny-list stays in
 * place to catch dynamic-import escape attempts like
 * `await import('node:' + 'os')`.
 *
 * Matches three import forms:
 *   - `from 'node:<name>'`
 *   - `from '<name>'`     (when nodeBare is true; Bun normalises some specifiers)
 *   - `import 'node:<name>'` / `import '<name>'` (side-effect form)
 *
 * Plugin sources are ESM-only, so we deliberately don't try to rewrite
 * `require('node:<name>')`.
 */

import type { BunPlugin } from 'bun';

export interface NodeBuiltinShimOptions {
  /** Plugin name used in the BunPlugin manifest (e.g. `brika-node-os-shim`). */
  readonly pluginName: string;
  /** Bare module name without the `node:` prefix (e.g. `os`, `fs/promises`). */
  readonly module: string;
  /** Absolute path to the runtime shim file the bundler will inline. */
  readonly shimPath: string;
  /**
   * When true, also rewrite the bare `<module>` specifier (no `node:`
   * prefix). Required for `fs/promises` because Bun normalises away the
   * `node:` prefix in some emit shapes; not needed for `os`.
   */
  readonly alsoRewriteBare?: boolean;
}

export function createNodeBuiltinShimPlugin(opts: NodeBuiltinShimOptions): BunPlugin {
  const replacement = `'${opts.shimPath}'`;
  const moduleEsc = escapeRegex(opts.module);
  const prefix = opts.alsoRewriteBare ? `(?:node:)?` : 'node:';
  const fromRegex = new RegExp(String.raw`(from\s*)(['"])${prefix}${moduleEsc}\2`, 'g');
  const sideEffectRegex = new RegExp(String.raw`(import\s*)(['"])${prefix}${moduleEsc}\2`, 'g');
  // Cheap pre-check so we can skip files that can't possibly need a
  // rewrite without paying the regex cost. The plain `module` name
  // covers both `node:<module>` and the bare form.
  const sniffString = opts.module;

  return {
    name: opts.pluginName,
    setup(build) {
      build.onLoad({ filter: /\.[tj]sx?$/ }, async (args) => {
        const original = await Bun.file(args.path).text();
        if (!original.includes(sniffString)) {
          return undefined;
        }
        const rewritten = original
          .replace(fromRegex, `$1${replacement}`)
          .replace(sideEffectRegex, `$1${replacement}`);
        if (rewritten === original) {
          return undefined;
        }
        return { contents: rewritten, loader: pickLoader(args.path) };
      });
    },
  };
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

/**
 * Escape regex metacharacters in a module name. Today only `/` appears
 * (in `fs/promises`) and `/` has no regex meaning, but escaping defends
 * against a future module name with `.` or other regex metacharacters.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}
