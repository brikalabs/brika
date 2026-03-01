/**
 * Flow Sources
 *
 * Source factories for creating flows from values, intervals, timers, etc.
 */

import type { Cleanup } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Source Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Factory function - receives emit callback, returns cleanup.
 */
export type Factory<T> = (emit: (value: T) => void) => Cleanup;

/**
 * Source object - wraps a factory for identification.
 */
export interface Source<T> {
  readonly __source: true;
  readonly start: Factory<T>;
}

/** Symbol marker for source detection */
const SOURCE_MARKER = '__source' as const;

/**
 * Check if a value is a Source
 */
export function isSource<T>(value: unknown): value is Source<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    SOURCE_MARKER in value &&
    (value as Source<T>).__source
  );
}

/**
 * Create a Source from a factory function.
 * Sources can be passed to start() to create flows.
 */
function createSource<T>(factory: Factory<T>): Source<T> {
  return {
    __source: true,
    start: factory,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in Sources
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an interval source that emits 0, 1, 2, ... every `ms` milliseconds.
 */
export function interval(ms: number): Source<number> {
  return createSource((emit) => {
    let count = 0;
    const id = setInterval(() => emit(count++), ms);
    return () => clearInterval(id);
  });
}

/**
 * Create a timer source that emits 0 once after `ms` milliseconds.
 */
export function timer(ms: number): Source<number> {
  return createSource((emit) => {
    const id = setTimeout(() => emit(0), ms);
    return () => clearTimeout(id);
  });
}
