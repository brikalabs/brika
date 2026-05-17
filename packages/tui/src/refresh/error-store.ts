/**
 * Subscribable HMR error store. Singleton on `globalThis` so the
 * watcher and React components (via `useHmrError()`) read the same
 * state. Failed reloads set; the next successful reload clears.
 */

import { useSyncExternalStore } from 'react';

export interface HmrError {
  /** Project-relative path of the file that failed to reload. */
  readonly file: string;
  /** Top-line error message — typically `Error.message`. */
  readonly message: string;
  /** Full stack, if available. */
  readonly stack?: string;
  /** `Date.now()` when the error landed (for fade/auto-dismiss UX). */
  readonly at: number;
}

interface State {
  value: HmrError | null;
  readonly listeners: Set<() => void>;
}

declare global {
  var __brikaHmrError: State | undefined;
}

const state: State =
  globalThis.__brikaHmrError ??
  (globalThis.__brikaHmrError = { value: null, listeners: new Set() });

/** Imperative read of the store — for class components that can't use hooks. */
export function getHmrError(): HmrError | null {
  return state.value;
}

/** Imperative subscribe — returns an unsubscribe fn. */
export function subscribeHmrError(cb: () => void): () => void {
  state.listeners.add(cb);
  return () => {
    state.listeners.delete(cb);
  };
}

export function useHmrError(): HmrError | null {
  return useSyncExternalStore(subscribeHmrError, getHmrError, () => null);
}

export function setHmrError(err: HmrError | null): void {
  state.value = err;
  for (const cb of state.listeners) {
    cb();
  }
}

export function clearHmrError(): void {
  setHmrError(null);
}

/**
 * Route asynchronous crashes (`uncaughtException`,
 * `unhandledRejection`) to the overlay instead of letting them kill
 * the dev process. Renders inside the React reconciler happen in
 * microtasks scheduled AFTER our refresh call returns — so a broken
 * component (`bare string outside <Text>`, hook-order change, …)
 * surfaces as an unhandled rejection at the Bun runtime level, which
 * is fatal without this guard.
 *
 * Idempotent. Safe to call from multiple init paths.
 */
export function installCrashGuard(): void {
  const g = globalThis as { __brikaCrashGuard?: boolean };
  if (g.__brikaCrashGuard) {
    return;
  }
  g.__brikaCrashGuard = true;
  process.on('uncaughtException', routeErrorToOverlay);
  process.on('unhandledRejection', routeErrorToOverlay);
}

function routeErrorToOverlay(err: unknown): void {
  setHmrError({
    file: '<runtime>',
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    at: Date.now(),
  });
}
