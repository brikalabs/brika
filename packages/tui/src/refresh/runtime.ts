/// <reference path="./react-refresh.d.ts" />
/**
 * Fast Refresh runtime singleton. Cache `react-refresh/runtime`'s
 * exports on `globalThis` and only inject the React DevTools hook
 * once — so if this file is re-evaluated by Vite's SSR loader or
 * any future hot-reload mechanism, callers still get the OLD
 * RefreshRuntime's `register` / `performReactRefresh` bound
 * functions (which close over the live family registry and tracked
 * roots).
 *
 * MUST be imported before any React-touching module. `preload.ts`
 * (Babel path) and `vite-poc.ts` (Vite path) both side-effect
 * import this first.
 */

import * as RefreshRuntime from 'react-refresh/runtime';

type RuntimeApi = {
  register: (type: unknown, id: string) => void;
  performReactRefresh: () => void;
  createSignatureFunctionForTransform: () => <T>(type: T, ...rest: unknown[]) => T;
};

declare global {
  var __brikaRefresh: RuntimeApi | undefined;
  var $RefreshReg$: (type: unknown, id: string) => void;
  var $RefreshSig$: () => <T>(type: T, ...rest: unknown[]) => T;
}

const api: RuntimeApi =
  globalThis.__brikaRefresh ??
  (() => {
    RefreshRuntime.injectIntoGlobalHook(globalThis);
    const fresh: RuntimeApi = {
      register: RefreshRuntime.register,
      performReactRefresh: RefreshRuntime.performReactRefresh,
      createSignatureFunctionForTransform: RefreshRuntime.createSignatureFunctionForTransform,
    };
    globalThis.__brikaRefresh = fresh;
    return fresh;
  })();

// Defaults for code that wasn't transformed by our pipeline. Each
// instrumented module overrides these in its own prologue.
globalThis.$RefreshReg$ = () => {
  // no-op for un-instrumented modules
};
globalThis.$RefreshSig$ = () => (type) => type;

export const Refresh = api;
export const performReactRefresh = api.performReactRefresh;
