/**
 * Test Fixtures for Flow Package
 *
 * Shared utilities for testing flows, operators, and combinators.
 */

import { CleanupRegistry, FlowImpl } from '../flow';
import type { Cleanup, Emitter } from '../types';

/**
 * Create a FlowImpl for testing with standard setTimeout.
 */
export function createTestFlow<T>(): {
  flow: FlowImpl<T>;
  cleanup: CleanupRegistry;
} {
  const cleanup = new CleanupRegistry();
  const setTimeoutFn = (fn: () => void, ms: number): Cleanup => {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  };
  const flow = new FlowImpl<T>(setTimeoutFn, cleanup);
  return {
    flow,
    cleanup,
  };
}

/**
 * Create a value collector for testing subscriptions.
 */
export function createValueCollector<T>(): {
  values: T[];
  subscriber: (v: T) => void;
  clear: () => void;
} {
  const values: T[] = [];
  const subscriber = (v: T) => values.push(v);
  const clear = () => (values.length = 0);
  return {
    values,
    subscriber,
    clear,
  };
}

/**
 * Wait for a specified number of milliseconds.
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a mock emitter for testing .to() routing.
 */
export function createMockEmitter<T>(): Emitter<T> & {
  emitted: T[];
} {
  const emitted: T[] = [];
  return {
    emit: (v: T) => emitted.push(v),
    emitAll: (values: T[]) => emitted.push(...values),
    emitted,
  };
}

/**
 * Push multiple values to a flow with optional delays between each.
 */
export async function pushValues<T>(flow: FlowImpl<T>, values: T[], delayMs = 0): Promise<void> {
  for (const v of values) {
    flow.push(v);
    if (delayMs > 0) {
      await wait(delayMs);
    }
  }
}
