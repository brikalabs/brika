/**
 * defineSharedStore — Zustand-style reactive store shared across the plugin process.
 *
 * Provides a simple get/set/subscribe API. Previously also acted as a hook
 * for server-side brick rendering; that path has been removed in favour of
 * client-rendered bricks.
 *
 * @example
 * ```ts
 * const counterStore = defineSharedStore({ count: 0 });
 *
 * // Read
 * counterStore.get().count;
 *
 * // Write (re-notifies all subscribers)
 * counterStore.set(prev => ({ ...prev, count: prev.count + 1 }));
 *
 * // Subscribe
 * const unsub = counterStore.subscribe(() => console.log(counterStore.get()));
 * ```
 */

export interface SharedStore<T> {
  /** Read current state (synchronous). */
  get(): T;
  /** Update state and notify all subscribers. */
  set(value: T | ((prev: T) => T)): void;
  /** Subscribe to state changes. Returns unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export function defineSharedStore<T>(initial: T): SharedStore<T> {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => state,

    set(value: T | ((prev: T) => T)): void {
      const next = typeof value === 'function' ? (value as (prev: T) => T)(state) : value;
      if (!Object.is(state, next)) {
        state = next;
        for (const fn of listeners) {
          fn();
        }
      }
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
