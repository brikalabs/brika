import { useState } from 'react';
import { type CreateRouterOptions, createRouter } from './createRouter';
import type { Router, RoutesShape } from './types';

/**
 * Create-once router instance. `useState`'s lazy initializer keeps
 * the instance stable across re-renders — equivalent to wrapping
 * `createRouter` in a `useRef`, just less ceremony.
 *
 * Pair with `<RouterProvider router={router}>`; the provider already
 * subscribes to route changes and re-renders descendants, so callers
 * don't need any explicit bridge to React's render loop.
 *
 * @example
 *   const router = useRouterInstance({ routes, initial: { name: 'main' } });
 *   return (
 *     <RouterProvider router={router}>
 *       <Outlet />
 *     </RouterProvider>
 *   );
 */
export function useRouterInstance<R extends RoutesShape>(
  options: CreateRouterOptions<R>
): Router<R> {
  // Initialize lazily so `createRouter` runs exactly once per mount.
  const [router] = useState(() => createRouter(options));
  return router;
}
