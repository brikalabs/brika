/**
 * Flow Operators
 *
 * Operators for transforming and controlling flows.
 * Use with pipe(): flow.pipe(map(...), filter(...), throttle(...))
 */

import type { FlowImpl } from './flow';
import type { Cleanup, Flow, Operator } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Transform Operators
// ─────────────────────────────────────────────────────────────────────────────

/** Map operator - transform each value */
export function map<T, R>(fn: (value: T) => R): Operator<T, R> {
  return (source) => {
    const impl = source as FlowImpl<T>;
    const mapped = impl._derive<R>();
    impl._subscribe((v) => mapped._push(fn(v)));
    return mapped;
  };
}

/** Filter operator - only emit values that pass predicate */
export function filter<T>(fn: (value: T) => boolean): Operator<T, T> {
  return (source) => {
    const impl = source as FlowImpl<T>;
    const filtered = impl._derive<T>();
    impl._subscribe((v) => {
      if (fn(v)) filtered._push(v);
    });
    return filtered;
  };
}

/** Tap operator - side effect without transforming */
export function tap<T>(fn: (value: T) => void): Operator<T, T> {
  return (source) => {
    const impl = source as FlowImpl<T>;
    const tapped = impl._derive<T>();
    impl._subscribe((v) => {
      fn(v);
      tapped._push(v);
    });
    return tapped;
  };
}

/** Scan operator - accumulate values */
export function scan<T, R>(fn: (acc: R, value: T) => R, seed: R): Operator<T, R> {
  return (source) => {
    const impl = source as FlowImpl<T>;
    const scanned = impl._derive<R>();
    let acc = seed;
    impl._subscribe((v) => {
      acc = fn(acc, v);
      scanned._push(acc);
    });
    return scanned;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Timing Operators
// ─────────────────────────────────────────────────────────────────────────────

/** Debounce operator - wait for silence before emitting */
export function debounce<T>(ms: number): Operator<T, T> {
  return (source) => {
    const impl = source as FlowImpl<T>;
    const debounced = impl._derive<T>();
    let cancel: Cleanup | null = null;
    impl._subscribe((v) => {
      cancel?.();
      cancel = impl._setTimeout(() => debounced._push(v), ms);
    });
    return debounced;
  };
}

/** Throttle operator - rate limit emissions */
export function throttle<T>(ms: number): Operator<T, T> {
  return (source) => {
    const impl = source as FlowImpl<T>;
    const throttled = impl._derive<T>();
    let lastEmit = 0;
    impl._subscribe((v) => {
      const now = Date.now();
      if (now - lastEmit >= ms) {
        lastEmit = now;
        throttled._push(v);
      }
    });
    return throttled;
  };
}

/** Delay operator - delay each value by ms */
export function delay<T>(ms: number): Operator<T, T> {
  return (source) => {
    const impl = source as FlowImpl<T>;
    const delayed = impl._derive<T>();
    impl._subscribe((v) => {
      impl._setTimeout(() => delayed._push(v), ms);
    });
    return delayed;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Control Operators
// ─────────────────────────────────────────────────────────────────────────────

/** Take operator - take first N values */
export function take<T>(n: number): Operator<T, T> {
  return (source) => {
    const impl = source as FlowImpl<T>;
    const taken = impl._derive<T>();
    let count = 0;
    impl._subscribe((v) => {
      if (count < n) {
        count++;
        taken._push(v);
      }
    });
    return taken;
  };
}

/** Skip operator - skip first N values */
export function skip<T>(n: number): Operator<T, T> {
  return (source) => {
    const impl = source as FlowImpl<T>;
    const skipped = impl._derive<T>();
    let count = 0;
    impl._subscribe((v) => {
      if (count >= n) {
        skipped._push(v);
      }
      count++;
    });
    return skipped;
  };
}

/** Distinct operator - only emit when value changes */
export function distinct<T>(): Operator<T, T> {
  return (source) => {
    const impl = source as FlowImpl<T>;
    const distinctFlow = impl._derive<T>();
    let last: T | undefined;
    let hasLast = false;
    impl._subscribe((v) => {
      if (!hasLast || v !== last) {
        hasLast = true;
        last = v;
        distinctFlow._push(v);
      }
    });
    return distinctFlow;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Advanced Operators
// ─────────────────────────────────────────────────────────────────────────────

/** Buffer operator - collect values until trigger emits */
export function buffer<T>(trigger: Flow<unknown>): Operator<T, T[]> {
  return (source) => {
    const impl = source as FlowImpl<T>;
    const buffered = impl._derive<T[]>();
    let buf: T[] = [];
    impl._subscribe((v) => buf.push(v));
    trigger.on(() => {
      if (buf.length > 0) {
        buffered._push(buf);
        buf = [];
      }
    });
    return buffered;
  };
}

/** Sample operator - emit latest value when trigger fires */
export function sample<T>(trigger: Flow<unknown>): Operator<T, T> {
  return (source) => {
    const impl = source as FlowImpl<T>;
    const sampled = impl._derive<T>();
    trigger.on(() => {
      const v = impl.latest();
      if (v !== undefined) {
        sampled._push(v);
      }
    });
    return sampled;
  };
}

/** SwitchMap operator - switch to new flow on each value */
export function switchMap<T, R>(fn: (value: T) => Flow<R>): Operator<T, R> {
  return (source) => {
    const impl = source as FlowImpl<T>;
    const switched = impl._derive<R>();
    let currentUnsub: Cleanup | null = null;
    impl._subscribe((v) => {
      currentUnsub?.();
      const inner = fn(v) as FlowImpl<R>;
      currentUnsub = inner._subscribeRaw((r) => switched._push(r));
    });
    return switched;
  };
}

/** FlatMap operator - flatten nested flows */
export function flatMap<T, R>(fn: (value: T) => Flow<R>): Operator<T, R> {
  return (source) => {
    const impl = source as FlowImpl<T>;
    const flat = impl._derive<R>();
    impl._subscribe((v) => {
      const inner = fn(v);
      inner.on((r) => flat._push(r));
    });
    return flat;
  };
}
