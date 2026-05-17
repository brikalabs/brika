/**
 * `<Outlet />` — renders the active route segment at this depth.
 *
 *   depth 0 → the top-level route's `component`.
 *   depth 1 → that route's child (if the parent has `children` and a
 *             child segment is active).
 *   depth N → recursive — drop an `<Outlet />` inside each parent
 *             component to render its child.
 *
 * `OutletDepthContext` is bumped every time we render so a nested
 * `<Outlet />` automatically targets the next segment of `router.path`.
 * `useOutletDepth()` lets non-Outlet primitives (notably `<Tabs router>`)
 * read the current depth to bind themselves to the right path slot.
 */

import type React from 'react';
import { createContext, useContext } from 'react';
import type { RoutesShape } from './types';
import { useRouter } from './useRouter';

const OutletDepthContext = createContext<number>(0);

/** Current depth of nesting inside `<Outlet />`s. `0` at the root,
 *  `1` inside a route's component when that route has children, etc. */
export function useOutletDepth(): number {
  return useContext(OutletDepthContext);
}

/**
 * Render the route at this outlet's depth. Walks the active path:
 *
 *   1. Read the segment at `router.path[depth]`.
 *   2. Walk `router.routes` down through parent names to find the
 *      route definition for that segment.
 *   3. Render the route's `component` with the segment's params
 *      spread as props, wrapping in a depth+1 context so a nested
 *      `<Outlet />` picks the next path segment.
 *
 * Returns `null` when there's no segment at this depth (parent's
 * component renders without a child) or when the route is
 * "state-machine-only" (no `component` declared).
 */
export function Outlet(): React.ReactElement | null {
  const router = useRouter();
  const depth = useContext(OutletDepthContext);
  const segment = router.path[depth];
  if (!segment) {
    return null;
  }

  const route = resolveRouteAt(router.routes, router.path, depth);
  if (!route?.component) {
    return null;
  }

  const Component = route.component;
  const params = (segment.params ?? {}) as Record<string, unknown>;
  return (
    <OutletDepthContext.Provider value={depth + 1}>
      <Component {...params} />
    </OutletDepthContext.Provider>
  );
}

/**
 * Walk the routes table down through parent segments to find the
 * route definition for `path[depth]`. Returns `null` when the path
 * doesn't match the routes tree (typo in a deep link, child route
 * removed under an active parent, etc.).
 */
function resolveRouteAt(
  routes: RoutesShape,
  path: ReadonlyArray<{ readonly name: string }>,
  depth: number
): RoutesShape[string] | null {
  let table: RoutesShape = routes;
  for (let i = 0; i < depth; i++) {
    const parent = path[i];
    if (!parent) {
      return null;
    }
    const parentRoute = table[parent.name];
    if (!parentRoute?.children) {
      return null;
    }
    table = parentRoute.children;
  }
  const leaf = path[depth];
  if (!leaf) {
    return null;
  }
  return table[leaf.name] ?? null;
}
