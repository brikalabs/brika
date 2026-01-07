/**
 * Internal Flow Utilities
 *
 * Factory functions for creating operators without exposing internal methods.
 * These are NOT exported from the main index - only used within the package.
 */

import { CleanupRegistry, FlowImpl } from './flow';
import type { Cleanup, Flow, Subscriber } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Flow Type Guards & Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure a Flow is a FlowImpl. If not, wrap it in one.
 * This allows operators to work with any Flow implementation.
 */
export function ensureFlowImpl<T>(source: Flow<T>): FlowImpl<T> {
  if (source instanceof FlowImpl) {
    return source;
  }

  // Wrap non-FlowImpl by creating a FlowImpl that subscribes to it
  const cleanup = new CleanupRegistry();
  const wrapper = new FlowImpl<T>((fn, ms) => {
    const timerId = setTimeout(fn, ms);
    return () => clearTimeout(timerId);
  }, cleanup);

  // Forward values from source to wrapper via public API
  source.on((v) => wrapper.push(v));

  return wrapper;
}

// ─────────────────────────────────────────────────────────────────────────────
// Operator Context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context provided to operator setup functions.
 * Contains everything operators need without exposing internal methods.
 */
export type OperatorContext<T, R> = {
  /** Subscribe to source values (with auto-cleanup) */
  subscribe: (fn: Subscriber<T>) => void;
  /** Subscribe to source values (returns unsubscribe function) */
  subscribeRaw: (fn: Subscriber<T>) => Cleanup;
  /** Push a value to the derived flow */
  push: (value: R) => void;
  /** Schedule a timeout with auto-cleanup */
  setTimeout: (fn: () => void, ms: number) => Cleanup;
  /** Get the latest value from source */
  latest: () => T | undefined;
};

// ─────────────────────────────────────────────────────────────────────────────
// Operator Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a derived flow from a source flow.
 * If source is not a FlowImpl, it will be wrapped automatically.
 *
 * @param source - The source flow to transform (any Flow implementation)
 * @param setup - Setup function that receives operator context
 * @returns A new derived flow
 */
export function operatorFlow<T, R>(
  source: Flow<T>,
  setup: (ctx: OperatorContext<T, R>) => void
): Flow<R> {
  const impl = ensureFlowImpl(source);
  const derived = impl.derive<R>();

  setup({
    subscribe: (fn) => impl.subscribe(fn),
    subscribeRaw: (fn) => impl.subscribeRaw(fn),
    push: (v) => derived.push(v),
    setTimeout: (fn, ms) => impl.setTimeout(fn, ms),
    latest: () => impl.latest(),
  });

  return derived;
}

// ─────────────────────────────────────────────────────────────────────────────
// External Flow Subscription Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subscribe to any Flow and get an unsubscribe function.
 * Used by operators like switchMap that need to subscribe to external flows.
 * If flow is not a FlowImpl, it will be wrapped automatically.
 */
export function subscribeRaw<T>(flow: Flow<T>, fn: Subscriber<T>): Cleanup {
  return ensureFlowImpl(flow).subscribeRaw(fn);
}

// ─────────────────────────────────────────────────────────────────────────────
// Combinator Context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context provided to combinator setup functions.
 */
export type CombinatorContext<R> = {
  /** Push a value to the output flow */
  push: (value: R) => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Combinator Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a standalone flow (not derived from a source).
 * Used by combinators that combine multiple flows into one.
 */
export function combinatorFlow<R>(setup: (ctx: CombinatorContext<R>) => void): Flow<R> {
  const cleanup = new CleanupRegistry();
  const flow = new FlowImpl<R>((fn, ms) => {
    const timerId = setTimeout(fn, ms);
    return () => clearTimeout(timerId);
  }, cleanup);

  setup({
    push: (v) => flow.push(v),
  });

  return flow;
}
