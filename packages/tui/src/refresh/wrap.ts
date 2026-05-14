/**
 * Shared prologue/epilogue that turns Babel-instrumented module code
 * into a Fast-Refresh-aware ES module. Used by both the Bun loader
 * (`plugin.ts`) and the watcher (`preload.ts`).
 *
 * The prologue rebinds `globalThis.$RefreshReg$` for the duration of
 * the module body so `react-refresh/babel`'s emitted `$RefreshReg$`
 * calls register each component under `<moduleId> <localName>` —
 * stable across reloads. The epilogue restores the previous bindings
 * so sibling modules' wraps aren't disturbed.
 *
 * (Vite path uses a slightly different scheme — module-local `const`
 * bindings — so it doesn't share this helper; see `vite-poc.ts`.)
 */

export function wrapWithRefresh(
  code: string,
  moduleId: string,
  runtimeUrl: string
): string {
  const id = JSON.stringify(moduleId);
  return [
    `import { Refresh as __Refresh } from ${JSON.stringify(runtimeUrl)};`,
    'var __prevRefreshReg = globalThis.$RefreshReg$;',
    'var __prevRefreshSig = globalThis.$RefreshSig$;',
    `globalThis.$RefreshReg$ = function (type, id) { __Refresh.register(type, ${id} + " " + id); };`,
    'globalThis.$RefreshSig$ = __Refresh.createSignatureFunctionForTransform;',
    code,
    'globalThis.$RefreshReg$ = __prevRefreshReg;',
    'globalThis.$RefreshSig$ = __prevRefreshSig;',
  ].join('\n');
}
