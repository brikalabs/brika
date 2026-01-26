/**
 * Flow Operators
 *
 * Operators for transforming and controlling flows.
 * Use with pipe(): flow.pipe(map(...), filter(...), throttle(...))
 */

import { operatorFlow, subscribeRaw } from './internal';
import type { Cleanup, Flow, Operator } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Transform Operators
// ─────────────────────────────────────────────────────────────────────────────

/** Map operator - transform each value */
export function map<T, R>(fn: (value: T) => R): Operator<T, R> {
  return (source) =>
    operatorFlow(source, ({ subscribe, push }) => {
      subscribe((v) => push(fn(v)));
    });
}

/** Filter operator - only emit values that pass predicate */
export function filter<T>(fn: (value: T) => boolean): Operator<T, T> {
  return (source) =>
    operatorFlow(source, ({ subscribe, push }) => {
      subscribe((v) => {
        if (fn(v)) push(v);
      });
    });
}

/** Tap operator - side effect without transforming */
export function tap<T>(fn: (value: T) => void): Operator<T, T> {
  return (source) =>
    operatorFlow(source, ({ subscribe, push }) => {
      subscribe((v) => {
        fn(v);
        push(v);
      });
    });
}

/** Scan operator - accumulate values */
export function scan<T, R>(fn: (acc: R, value: T) => R, seed: R): Operator<T, R> {
  return (source) =>
    operatorFlow(source, ({ subscribe, push }) => {
      let acc = seed;
      subscribe((v) => {
        acc = fn(acc, v);
        push(acc);
      });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Timing Operators
// ─────────────────────────────────────────────────────────────────────────────

/** Debounce operator - wait for silence before emitting */
export function debounce<T>(ms: number): Operator<T, T> {
  return (source) =>
    operatorFlow(source, ({ subscribe, push, setTimeout }) => {
      let cancel: Cleanup | null = null;
      const handleValue = (v: T) => {
        cancel?.();
        cancel = setTimeout(() => push(v), ms);
      };
      subscribe(handleValue);
    });
}

/** Throttle operator - rate limit emissions */
export function throttle<T>(ms: number): Operator<T, T> {
  return (source) =>
    operatorFlow(source, ({ subscribe, push }) => {
      let lastEmit = 0;
      subscribe((v) => {
        const now = Date.now();
        if (now - lastEmit >= ms) {
          lastEmit = now;
          push(v);
        }
      });
    });
}

/** Delay operator - delay each value by ms */
export function delay<T>(ms: number): Operator<T, T> {
  return (source) =>
    operatorFlow(source, ({ subscribe, push, setTimeout }) => {
      const handleValue = (v: T) => {
        setTimeout(() => push(v), ms);
      };
      subscribe(handleValue);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Control Operators
// ─────────────────────────────────────────────────────────────────────────────

/** Take operator - take first N values */
export function take<T>(n: number): Operator<T, T> {
  return (source) =>
    operatorFlow(source, ({ subscribe, push }) => {
      let count = 0;
      subscribe((v) => {
        if (count < n) {
          count++;
          push(v);
        }
      });
    });
}

/** Skip operator - skip first N values */
export function skip<T>(n: number): Operator<T, T> {
  return (source) =>
    operatorFlow(source, ({ subscribe, push }) => {
      let count = 0;
      subscribe((v) => {
        if (count >= n) {
          push(v);
        }
        count++;
      });
    });
}

/** Distinct operator - only emit when value changes */
export function distinct<T>(): Operator<T, T> {
  return (source) =>
    operatorFlow(source, ({ subscribe, push }) => {
      let last: T | undefined;
      let hasLast = false;
      subscribe((v) => {
        if (!hasLast || v !== last) {
          hasLast = true;
          last = v;
          push(v);
        }
      });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Advanced Operators
// ─────────────────────────────────────────────────────────────────────────────

/** Buffer operator - collect values until trigger emits */
export function buffer<T>(trigger: Flow<unknown>): Operator<T, T[]> {
  return (source) =>
    operatorFlow(source, ({ subscribe, push }) => {
      let buf: T[] = [];
      subscribe((v) => buf.push(v));
      trigger.on(() => {
        if (buf.length > 0) {
          push(buf);
          buf = [];
        }
      });
    });
}

/** Sample operator - emit latest value when trigger fires */
export function sample<T>(trigger: Flow<unknown>): Operator<T, T> {
  return (source) =>
    operatorFlow(source, ({ push, latest }) => {
      trigger.on(() => {
        const v = latest();
        if (v !== undefined) {
          push(v);
        }
      });
    });
}

/** SwitchMap operator - switch to new flow on each value */
export function switchMap<T, R>(fn: (value: T) => Flow<R>): Operator<T, R> {
  return (source) =>
    operatorFlow(source, ({ subscribe, push }) => {
      let currentUnsub: Cleanup | null = null;
      const handleValue = (v: T) => {
        currentUnsub?.();
        const inner = fn(v);
        currentUnsub = subscribeRaw(inner, (r) => push(r));
      };
      subscribe(handleValue);
    });
}

/** FlatMap operator - flatten nested flows */
export function flatMap<T, R>(fn: (value: T) => Flow<R>): Operator<T, R> {
  return (source) =>
    operatorFlow(source, ({ subscribe, push }) => {
      const handleValue = (v: T) => {
        const inner = fn(v);
        inner.on((r) => push(r));
      };
      subscribe(handleValue);
    });
}
