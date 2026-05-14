import type React from 'react';
import { createContext, useContext } from 'react';
import { useRouter } from './useRouter';

/**
 * Tracks how many `<Outlet />` ancestors have already rendered.
 *
 *   depth 0 → outermost outlet. Renders the route's `layout` if any,
 *             else the route's `component`.
 *   depth 1 → outlet INSIDE a layout. Renders the route's `component`.
 *
 * A single context value keeps the recursion bounded (we only support
 * 1 level of layout). Trying to nest a third `<Outlet />` is a no-op.
 */
const OutletDepthContext = createContext<number>(0);

/**
 * Render the active route. The default flow:
 *
 *   - If the active route has a `layout`, render `<layout />`. The
 *     layout component should itself contain a nested `<Outlet />`
 *     where the route's `component` will appear.
 *   - Otherwise render the route's `component` directly with its
 *     params spread as props.
 *
 * Use this when route components are self-contained (or share chrome
 * via a layout). When a view needs ambient app state (focused tab,
 * scroll, search…), the parent can switch on `useRouter().current.name`
 * and render explicitly — `<Outlet />` is for the simple case.
 */
export function Outlet(): React.ReactElement | null {
  const router = useRouter();
  const depth = useContext(OutletDepthContext);
  const active = router.current;
  const route = router.routes[active.name];
  if (!route) {
    return null;
  }

  // First outlet on the render path — render the layout if any.
  if (depth === 0 && route.layout) {
    const Layout = route.layout;
    return (
      <OutletDepthContext.Provider value={depth + 1}>
        <Layout />
      </OutletDepthContext.Provider>
    );
  }

  // Either no layout, or we're already inside one — render the leaf.
  // Routes declared without a `component` are intentionally
  // state-machine-only (parent handles render via `router.current.name`
  // dispatch). Returning null keeps `<Outlet />` safe to drop into a
  // tree even when not every route opts in.
  const Component = route.component;
  if (!Component) {
    return null;
  }
  const params: unknown = 'params' in active ? active.params : undefined;
  // biome-ignore lint/suspicious/noExplicitAny: route components are heterogeneous at the table level
  const C = Component as React.ComponentType<any>;
  return <C {...(params ?? {})} />;
}
