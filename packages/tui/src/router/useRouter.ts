import { useContext, useSyncExternalStore } from 'react';
import { RouterContext } from './Provider';
import type { Router, RoutesShape } from './types';

/**
 * Access the router from any descendant of `<RouterProvider>`. The
 * caller supplies the routes shape generic so `navigate(name, params)`
 * and `current` are typed against the exact route definitions.
 *
 * Each consumer subscribes itself to the router via
 * `useSyncExternalStore` so route changes propagate even though the
 * router's reference identity is stable across navigations. Without
 * this, a `value={router}` Context.Provider would never trigger
 * consumer re-renders — the classic "observable in context" pitfall.
 *
 * Throws when used outside a provider — a hard error is friendlier
 * than silently returning `null` and crashing later.
 *
 * @example
 *   const router = useRouter<typeof routes>();
 *   router.navigate('input', { serviceId: 'hub' });
 *   if (router.current.name === 'input') {
 *     // router.current.params is fully typed here
 *   }
 */
export function useRouter<R extends RoutesShape>(): Router<R> {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('useRouter() called outside <RouterProvider>');
  }
  // Triggers a re-render whenever the router's path changes. We
  // snapshot `router.path` — the full root→leaf segment array, whose
  // identity changes on every `navigate` / `navigatePath` / `back`.
  // (Snapshotting `current` would miss nested-only navigation, since
  // `current` only reflects the top-level segment.)
  useSyncExternalStore(
    (callback) => router.subscribe(callback),
    () => router.path
  );
  return router as Router<R>;
}
