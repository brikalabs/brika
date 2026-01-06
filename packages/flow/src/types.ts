/**
 * Flow Types
 *
 * Core type definitions for the reactive flow system.
 */

import type { Serializable } from '@brika/serializable';

// Re-export Serializable for convenience
export type { Serializable };

/** Cleanup function */
export type Cleanup = () => void;

/** Subscriber callback */
export type Subscriber<T> = (value: T) => void;

/** Operator function type */
export type Operator<In, Out> = (source: Flow<In>) => Flow<Out>;

/**
 * Reactive flow - a typed event stream.
 * Use pipe() with operators to transform, .to() to route, .on() for side effects.
 */
export interface Flow<T> {
  /** Subscribe with callback (auto-cleaned up) */
  on(fn: Subscriber<T>): void;

  /** Route to one or more output emitters (auto-cleaned up) */
  to(...emitters: Emitter<T>[]): void;

  /** Get last received value */
  latest(): T | undefined;

  /** Pipe through operators */
  pipe<A>(op1: Operator<T, A>): Flow<A>;
  pipe<A, B>(op1: Operator<T, A>, op2: Operator<A, B>): Flow<B>;
  pipe<A, B, C>(op1: Operator<T, A>, op2: Operator<A, B>, op3: Operator<B, C>): Flow<C>;
  pipe<A, B, C, D>(
    op1: Operator<T, A>,
    op2: Operator<A, B>,
    op3: Operator<B, C>,
    op4: Operator<C, D>
  ): Flow<D>;
  pipe<A, B, C, D, E>(
    op1: Operator<T, A>,
    op2: Operator<A, B>,
    op3: Operator<B, C>,
    op4: Operator<C, D>,
    op5: Operator<D, E>
  ): Flow<E>;
  pipe(...ops: Operator<unknown, unknown>[]): Flow<unknown>;
}

/**
 * Output emitter - sends typed data to an output port.
 */
export interface Emitter<T> {
  /** Emit a value to connected blocks */
  emit(value: T): void;

  /** Emit multiple values */
  emitAll(values: T[]): void;
}
