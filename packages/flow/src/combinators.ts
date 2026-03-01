/**
 * Flow Combinators
 *
 * Functions for combining multiple flows.
 */

import { combinatorFlow } from './internal';
import type { Flow } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Combinators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Combine latest values from multiple flows.
 * Emits when any flow emits, using latest value from each.
 */
export function combine<A, B>(
  a: Flow<A>,
  b: Flow<B>
): Flow<
  [
    A,
    B,
  ]
>;
export function combine<A, B, C>(
  a: Flow<A>,
  b: Flow<B>,
  c: Flow<C>
): Flow<
  [
    A,
    B,
    C,
  ]
>;
export function combine<A, B, C, D>(
  a: Flow<A>,
  b: Flow<B>,
  c: Flow<C>,
  d: Flow<D>
): Flow<
  [
    A,
    B,
    C,
    D,
  ]
>;
export function combine(...flows: Flow<unknown>[]): Flow<unknown[]> {
  return createCombineFlow(flows, 'combineLatest');
}

/**
 * Wait for all flows to emit, then emit tuple.
 */
export function zip<A, B>(
  a: Flow<A>,
  b: Flow<B>
): Flow<
  [
    A,
    B,
  ]
>;
export function zip<A, B, C>(
  a: Flow<A>,
  b: Flow<B>,
  c: Flow<C>
): Flow<
  [
    A,
    B,
    C,
  ]
>;
export function zip(...flows: Flow<unknown>[]): Flow<unknown[]> {
  return createCombineFlow(flows, 'zip');
}

/**
 * Merge multiple flows into one.
 */
export function merge<T>(...flows: Flow<T>[]): Flow<T> {
  return combinatorFlow(({ push }) => {
    for (const flow of flows) {
      flow.on((v) => push(v));
    }
  });
}

/**
 * Race: emit from whichever flow emits first.
 */
export function race<T>(...flows: Flow<T>[]): Flow<T> {
  return combinatorFlow(({ push }) => {
    let won = false;
    for (const flow of flows) {
      flow.on((v) => {
        if (!won) {
          won = true;
          push(v);
        }
      });
    }
  });
}

/**
 * Wait for all flows to emit at least once.
 */
export function all<A, B>(
  a: Flow<A>,
  b: Flow<B>
): Flow<
  [
    A,
    B,
  ]
>;
export function all<A, B, C>(
  a: Flow<A>,
  b: Flow<B>,
  c: Flow<C>
): Flow<
  [
    A,
    B,
    C,
  ]
>;
export function all(...flows: Flow<unknown>[]): Flow<unknown[]> {
  return createCombineFlow(flows, 'all');
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Options for handleCombineValue */
interface CombineValueOptions {
  v: unknown;
  i: number;
  mode: 'combineLatest' | 'zip' | 'all';
  values: unknown[];
  hasValue: boolean[];
  pendingZip: unknown[][];
  allEmitted: {
    current: boolean;
  };
  push: (value: unknown[]) => void;
}

/** Handle value emission for combine operators */
function handleCombineValue({
  v,
  i,
  mode,
  values,
  hasValue,
  pendingZip,
  allEmitted,
  push,
}: CombineValueOptions): void {
  if (mode === 'zip') {
    pendingZip[i]?.push(v);
    if (pendingZip.every((arr) => arr.length > 0)) {
      const tuple = pendingZip.map((arr) => arr.shift());
      push(tuple);
    }
  } else if (mode === 'all') {
    values[i] = v;
    hasValue[i] = true;
    if (!allEmitted.current && hasValue.every(Boolean)) {
      allEmitted.current = true;
      push([
        ...values,
      ]);
    }
  } else {
    values[i] = v;
    hasValue[i] = true;
    if (hasValue.every(Boolean)) {
      push([
        ...values,
      ]);
    }
  }
}

function createCombineFlow(
  flows: Flow<unknown>[],
  mode: 'combineLatest' | 'zip' | 'all'
): Flow<unknown[]> {
  return combinatorFlow(({ push }) => {
    const values: unknown[] = new Array(flows.length).fill(undefined);
    const hasValue: boolean[] = new Array(flows.length).fill(false);
    const pendingZip: unknown[][] = flows.map(() => []);
    const allEmitted = {
      current: false,
    };

    flows.forEach((flow, i) => {
      const handleValue = (v: unknown) => {
        handleCombineValue({
          v,
          i,
          mode,
          values,
          hasValue,
          pendingZip,
          allEmitted,
          push,
        });
      };
      flow.on(handleValue);
    });
  });
}
