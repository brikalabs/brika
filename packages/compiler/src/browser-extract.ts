/**
 * Reads a browser module's exports (a brick or page `.tsx`) at build time
 * WITHOUT running its view. The view is bundled with react, lucide, clsx/cva,
 * and `@brika/sdk/ui-kit` replaced by inert stubs so the module evaluates far
 * enough to surface its `defineBrick` descriptor / `meta` / `config` exports,
 * then the result is imported and its namespace returned. `@brika/sdk` itself
 * stays external so its `z` is the same instance the manifest lowering uses.
 */

import { rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BunPlugin } from 'bun';

/** Extract a human-readable message from an unknown thrown value. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Bumped per dynamic import so repeated builds in one process re-run modules. */
let importSalt = 0;

// Stand-in for `react` and its JSX runtimes. Plugins do not depend on react;
// the host provides it at runtime. Every binding a brick imports must exist as
// a name here, but none is ever called (the component is never rendered).
const REACT_STUB = `
const noop = () => {};
export const useState = (v) => [typeof v === 'function' ? v() : v, noop];
export const useEffect = noop;
export const useLayoutEffect = noop;
export const useMemo = (fn) => (typeof fn === 'function' ? fn() : undefined);
export const useCallback = (fn) => fn;
export const useRef = (v) => ({ current: v === undefined ? null : v });
export const useContext = () => undefined;
export const useReducer = (_r, init) => [init, noop];
export const useId = () => 'brika-id';
export const useImperativeHandle = noop;
export const useSyncExternalStore = () => undefined;
export const createElement = noop;
export const cloneElement = noop;
export const createContext = () => ({ Provider: noop, Consumer: noop });
export const forwardRef = (fn) => fn;
export const memo = (fn) => fn;
export const Fragment = 'fragment';
export const StrictMode = 'strict-mode';
export const jsx = noop;
export const jsxs = noop;
export const jsxDEV = noop;
export default { createElement, Fragment };
`;

// Stand-in for lucide-react: icon names cannot be enumerated, so a CJS Proxy
// satisfies any named import. Icons are only referenced inside the unrun view,
// so resolving to undefined is fine.
const PROXY_STUB = 'const fn = () => undefined; module.exports = new Proxy(fn, { get: () => fn });';

// Stand-in for clsx / class-variance-authority. Unlike icons, these can be
// CALLED at module top level (e.g. `const v = cva(...)`), so they must be real
// callables that return callables, with their exports named explicitly.
const UTIL_STUB = `
const cx = () => '';
const cva = () => () => '';
export default cx;
export { cx, cva };
export const clsx = cx;
export const cn = cx;
export const compose = cva;
export const twMerge = cx;
`;

const browserBuildPlugin: BunPlugin = {
  name: 'brika-browser-extract',
  setup(build) {
    // react is referenced only inside the unrun view; stub it and its runtimes.
    build.onResolve({ filter: /^react(-dom)?($|\/)/ }, (args) => ({
      path: args.path,
      namespace: 'brika-react-stub',
    }));
    // @brika/sdk/ui-kit (components + hooks + icons) pulls react, so stub it.
    // Must precede the general @brika/sdk rule below.
    build.onResolve({ filter: /^@brika\/sdk\/ui-kit(\/.*)?$/ }, (args) => ({
      path: args.path,
      namespace: 'brika-proxy-stub',
    }));
    // lucide-react: arbitrary icon names, referenced only inside the view.
    build.onResolve({ filter: /^lucide-react$/ }, (args) => ({
      path: args.path,
      namespace: 'brika-proxy-stub',
    }));
    // node:/bun: builtins are reachable only through a server module the view
    // imports (e.g. a store pulling node:sqlite). The view never runs in this
    // build, so resolve them to a no-op proxy instead of failing to bundle.
    build.onResolve({ filter: /^(node|bun):/ }, (args) => ({
      path: args.path,
      namespace: 'brika-proxy-stub',
    }));
    // clsx / cva: may be called at module top level, so need real callables.
    build.onResolve({ filter: /^(clsx|class-variance-authority)$/ }, (args) => ({
      path: args.path,
      namespace: 'brika-util-stub',
    }));
    // Everything else under @brika/sdk is import-safe; keep it external so its
    // `z` is the same instance zodToPreferences uses (cross-instance is unsafe).
    build.onResolve({ filter: /^@brika\/sdk(\/.*)?$/ }, (args) => ({
      path: args.path,
      external: true,
    }));
    build.onLoad({ filter: /.*/, namespace: 'brika-react-stub' }, () => ({
      loader: 'js',
      contents: REACT_STUB,
    }));
    build.onLoad({ filter: /.*/, namespace: 'brika-proxy-stub' }, () => ({
      loader: 'js',
      contents: PROXY_STUB,
    }));
    build.onLoad({ filter: /.*/, namespace: 'brika-util-stub' }, () => ({
      loader: 'js',
      contents: UTIL_STUB,
    }));
  },
};

/** A browser module's evaluated exports, or the error that prevented reading it. */
export type BrowserModuleResult = { ns: Record<string, unknown> } | { error: string };

/**
 * Bundle a browser module (brick or page) with react/ui stubbed and `@brika/sdk`
 * external, import the result, and return its exports. The temp file is written
 * beside the source so its `@brika/sdk` import resolves exactly as it would.
 */
export async function readBrowserModule(file: string): Promise<BrowserModuleResult> {
  let built: Awaited<ReturnType<typeof Bun.build>>;
  try {
    built = await Bun.build({
      entrypoints: [file],
      target: 'bun',
      plugins: [browserBuildPlugin],
    });
  } catch (err) {
    return { error: errorMessage(err) };
  }
  if (!built.success) {
    return { error: built.logs.map((l) => l.message).join('; ') };
  }
  const [output] = built.outputs;
  if (!output) {
    return { error: 'bundling produced no output' };
  }
  importSalt += 1;
  const tmp = join(dirname(file), `.brika-manifest.${basename(file, '.tsx')}.${importSalt}.mjs`);
  try {
    await Bun.write(tmp, await output.text());
    const ns: Record<string, unknown> = await import(pathToFileURL(tmp).href);
    return { ns };
  } catch (err) {
    return { error: errorMessage(err) };
  } finally {
    await rm(tmp, { force: true });
  }
}
