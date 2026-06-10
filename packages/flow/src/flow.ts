/**
 * Flow Implementation
 *
 * Core FlowImpl class and CleanupRegistry.
 */

import type { Cleanup, Emitter, Flow, FlowErrorHandler, Operator, Subscriber } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registry for tracking subscriptions and timers for cleanup.
 */
export class CleanupRegistry {
  readonly #cleanups: Cleanup[] = [];

  register(cleanup: Cleanup): void {
    this.#cleanups.push(cleanup);
  }

  cleanup(): void {
    for (const fn of this.#cleanups) {
      try {
        fn();
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[flow] cleanup error', err);
        }
      }
    }
    this.#cleanups.length = 0;
  }

  get count(): number {
    return this.#cleanups.length;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Flow Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FlowImpl - the concrete implementation of Flow.
 *
 * Internal methods (_push, _derive, etc.) are prefixed with underscore.
 * These are used by operators but hidden from users who work with Flow<T>.
 */
const defaultFlowErrorHandler: FlowErrorHandler = (error) => {
  console.error('Unhandled flow subscriber error:', error);
};

export class FlowImpl<T> implements Flow<T> {
  readonly #subscribers = new Set<Subscriber<T>>();
  readonly #setTimeoutFn: (fn: () => void, ms: number) => Cleanup;
  readonly #cleanup: CleanupRegistry;
  readonly #onError: FlowErrorHandler;
  #latest: T | undefined;

  constructor(
    setTimeoutFn: (fn: () => void, ms: number) => Cleanup,
    cleanup: CleanupRegistry,
    onError: FlowErrorHandler = defaultFlowErrorHandler
  ) {
    this.#setTimeoutFn = setTimeoutFn;
    this.#cleanup = cleanup;
    this.#onError = onError;
  }

  /**
   * Push a value to subscribers. A subscriber that throws (or returns a
   * rejecting promise) is reported to the flow's error handler; it never
   * breaks delivery to the other subscribers or escapes as an unhandled
   * rejection.
   */
  push(value: T): void {
    this.#latest = value;
    for (const sub of this.#subscribers) {
      try {
        // Subscribers are typed void, but async handlers hand back a promise;
        // observe it so rejections are reported instead of unhandled.
        const result: unknown = sub(value);
        if (result instanceof Promise) {
          result.catch((error: unknown) => this.#onError(error));
        }
      } catch (error) {
        this.#onError(error);
      }
    }
  }

  /** Clear all subscribers */
  clear(): void {
    this.#subscribers.clear();
  }

  /** Subscribe without auto-cleanup (returns unsubscribe) */
  subscribeRaw(fn: Subscriber<T>): Cleanup {
    this.#subscribers.add(fn);
    return () => this.#subscribers.delete(fn);
  }

  /** Subscribe with auto-cleanup */
  subscribe(fn: Subscriber<T>): void {
    this.#subscribers.add(fn);
    const cleanup = () => this.#subscribers.delete(fn);
    this.#cleanup.register(cleanup);
  }

  /** Create a derived flow with same context */
  derive<R>(): FlowImpl<R> {
    return new FlowImpl<R>(this.#setTimeoutFn, this.#cleanup, this.#onError);
  }

  /** setTimeout with auto-cleanup */
  setTimeout(fn: () => void, ms: number): Cleanup {
    return this.#setTimeoutFn(fn, ms);
  }

  on(fn: Subscriber<T>): void {
    this.subscribe(fn);
  }

  to(...emitters: Emitter<T>[]): void {
    this.subscribe((v) => {
      for (const emitter of emitters) {
        emitter.emit(v);
      }
    });
  }

  latest(): T | undefined {
    return this.#latest;
  }

  pipe(...ops: Operator<any, any>[]): Flow<any> {
    return ops.reduce<Flow<any>>((acc, op) => op(acc), this);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory Functions
// ─────────────────────────────────────────────────────────────────────────────

/** Create a Flow with auto-cleanup */
export function createFlow<T>(
  setTimeoutFn: (fn: () => void, ms: number) => Cleanup,
  cleanup: CleanupRegistry,
  onError?: FlowErrorHandler
): FlowImpl<T> {
  return new FlowImpl<T>(setTimeoutFn, cleanup, onError);
}
