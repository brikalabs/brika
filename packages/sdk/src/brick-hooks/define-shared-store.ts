/**
 * defineSharedStore — Zustand-style reactive store shared across brick instances.
 *
 * ```tsx
 * // Define at module level
 * const useCounter = defineSharedStore({ count: 0 });
 *
 * // In brick — reactive read
 * const { count } = useCounter();
 *
 * // Anywhere — write (re-renders all subscribers)
 * useCounter.set(prev => ({ ...prev, count: prev.count + 1 }));
 *
 * // Anywhere — synchronous read
 * useCounter.get().count;
 * ```
 */

import { getState, nextHookIdx } from './state';
import { useEffect } from './use-effect';

export interface SharedStore<T> {
  /** Hook — call inside a brick to read state reactively. */
  (): T;
  /** Read current state (synchronous, non-reactive). */
  get(): T;
  /** Update state and re-render all subscribed brick instances. */
  set(value: T | ((prev: T) => T)): void;
}

export function defineSharedStore<T>(initial: T): SharedStore<T> {
  let state = initial;
  const listeners = new Set<() => void>();

  function useStore(): T {
    const brickState = getState();
    const idx = nextHookIdx();

    // Subscribe synchronously on first render — no deferred effect, no race.
    // `scheduleRender` is stable per-instance and debounced via queueMicrotask.
    if (brickState.hooks.length <= idx) {
      brickState.hooks[idx] = true;
      listeners.add(brickState.scheduleRender);
    }

    // Register cleanup for unmount
    useEffect(() => {
      return () => {
        listeners.delete(brickState.scheduleRender);
      };
    }, []);

    return state;
  }

  useStore.get = (): T => state;

  useStore.set = (value: T | ((prev: T) => T)): void => {
    const next = typeof value === 'function' ? (value as (prev: T) => T)(state) : value;
    if (!Object.is(state, next)) {
      state = next;
      for (const fn of listeners) fn();
    }
  };

  return useStore as SharedStore<T>;
}
