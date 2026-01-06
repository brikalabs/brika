/**
 * Flow Combinators
 *
 * Functions for combining multiple flows.
 */

import { CleanupRegistry, FlowImpl } from './flow';
import type { Flow } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Combinators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Combine latest values from multiple flows.
 * Emits when any flow emits, using latest value from each.
 */
export function combine<A, B>(a: Flow<A>, b: Flow<B>): Flow<[A, B]>;
export function combine<A, B, C>(a: Flow<A>, b: Flow<B>, c: Flow<C>): Flow<[A, B, C]>;
export function combine<A, B, C, D>(
  a: Flow<A>,
  b: Flow<B>,
  c: Flow<C>,
  d: Flow<D>
): Flow<[A, B, C, D]>;
export function combine(...flows: Flow<unknown>[]): Flow<unknown[]> {
  return createCombineFlow(flows, 'combineLatest');
}

/**
 * Wait for all flows to emit, then emit tuple.
 */
export function zip<A, B>(a: Flow<A>, b: Flow<B>): Flow<[A, B]>;
export function zip<A, B, C>(a: Flow<A>, b: Flow<B>, c: Flow<C>): Flow<[A, B, C]>;
export function zip(...flows: Flow<unknown>[]): Flow<unknown[]> {
  return createCombineFlow(flows, 'zip');
}

/**
 * Merge multiple flows into one.
 */
export function merge<T>(...flows: Flow<T>[]): Flow<T> {
  return createMergeFlow(flows);
}

/**
 * Race: emit from whichever flow emits first.
 */
export function race<T>(...flows: Flow<T>[]): Flow<T> {
  return createRaceFlow(flows);
}

/**
 * Wait for all flows to emit at least once.
 */
export function all<A, B>(a: Flow<A>, b: Flow<B>): Flow<[A, B]>;
export function all<A, B, C>(a: Flow<A>, b: Flow<B>, c: Flow<C>): Flow<[A, B, C]>;
export function all(...flows: Flow<unknown>[]): Flow<unknown[]> {
  return createCombineFlow(flows, 'all');
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createCombineFlow(
  flows: Flow<unknown>[],
  mode: 'combineLatest' | 'zip' | 'all'
): Flow<unknown[]> {
  const cleanup = new CleanupRegistry();
  const combined = new FlowImpl<unknown[]>((fn, ms) => {
    const timerId = setTimeout(fn, ms);
    return () => clearTimeout(timerId);
  }, cleanup);

  const values: (unknown | undefined)[] = new Array(flows.length).fill(undefined);
  const hasValue: boolean[] = new Array(flows.length).fill(false);
  const pendingZip: unknown[][] = flows.map(() => []);
  let allEmitted = false;

  flows.forEach((flow, i) => {
    flow.on((v) => {
      if (mode === 'zip') {
        pendingZip[i]?.push(v);
        if (pendingZip.every((arr) => arr.length > 0)) {
          const tuple = pendingZip.map((arr) => arr.shift());
          combined._push(tuple);
        }
      } else if (mode === 'all') {
        values[i] = v;
        hasValue[i] = true;
        if (!allEmitted && hasValue.every(Boolean)) {
          allEmitted = true;
          combined._push([...values]);
        }
      } else {
        values[i] = v;
        hasValue[i] = true;
        if (hasValue.every(Boolean)) {
          combined._push([...values]);
        }
      }
    });
  });

  return combined;
}

function createMergeFlow<T>(flows: Flow<T>[]): Flow<T> {
  const cleanup = new CleanupRegistry();
  const merged = new FlowImpl<T>((fn, ms) => {
    const timerId = setTimeout(fn, ms);
    return () => clearTimeout(timerId);
  }, cleanup);

  for (const flow of flows) {
    flow.on((v) => merged._push(v));
  }

  return merged;
}

function createRaceFlow<T>(flows: Flow<T>[]): Flow<T> {
  const cleanup = new CleanupRegistry();
  const raced = new FlowImpl<T>((fn, ms) => {
    const timerId = setTimeout(fn, ms);
    return () => clearTimeout(timerId);
  }, cleanup);

  let won = false;
  for (const flow of flows) {
    flow.on((v) => {
      if (!won) {
        won = true;
        raced._push(v);
      }
    });
  }

  return raced;
}
