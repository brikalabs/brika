/**
 * Tiny TUI router.
 *
 * Declarative route definitions; one router instance per app; a
 * `useRouter()` hook gives navigate / back / current; an `<Outlet />`
 * renders the active route's component. Routes can nest via the
 * `children` field — each level is its own `<Outlet />`, and nested
 * navigation is path-based.
 *
 * @example basic flat router
 *   const routes = {
 *     main: defineRoute({ component: MainView }),
 *     help: defineRoute({ component: HelpView }),
 *     input: defineRoute<{ serviceId: string }>({ component: InputView }),
 *   } as const satisfies RoutesShape;
 *
 *   const router = createRouter({ routes, initial: { name: 'main' } });
 *
 *   <RouterProvider router={router}>
 *     <Outlet />
 *   </RouterProvider>
 *
 * @example nested routes (parent component is the layout)
 *   const routes = {
 *     plugins: defineRoute({
 *       component: PluginsLayout,
 *       children: {
 *         installed: defineRoute({ component: InstalledTab }),
 *         search:    defineRoute({ component: SearchTab }),
 *       },
 *     }),
 *   } as const satisfies RoutesShape;
 *
 *   function PluginsLayout(): React.ReactElement {
 *     return (
 *       <Tabs router defaultValue="installed">
 *         <TabsList>
 *           <TabsTrigger value="installed">Installed</TabsTrigger>
 *           <TabsTrigger value="search">Search</TabsTrigger>
 *         </TabsList>
 *         <Outlet />
 *       </Tabs>
 *     );
 *   }
 *
 *   // deep-link from elsewhere:
 *   router.navigatePath([{ name: 'plugins' }, { name: 'search' }]);
 */

import type { RouteDef } from './types';

export { type CreateRouterOptions, createRouter } from './createRouter';
export { Outlet, useOutletDepth } from './Outlet';
export { RouterContext, RouterProvider, type RouterProviderProps } from './Provider';
export type {
  ActiveRoute,
  NavigateArgs,
  ParamsOf,
  RouteDef,
  RoutePath,
  Router,
  RouterListener,
  RouteSegment,
  RoutesShape,
} from './types';
export { useRouter } from './useRouter';
export { useRouterInstance } from './useRouterInstance';

/**
 * Declare a single route. Pass the params type as the generic — TS
 * propagates it through `navigate`, `useRouter().current`, and
 * `<Outlet />` so nothing falls back to `any`.
 *
 * @example
 *   const help = defineRoute({ component: HelpView });
 *   const input = defineRoute<{ serviceId: string }>({ component: InputView });
 *   // Parent route with sub-routes — its `component` is the layout.
 *   const plugins = defineRoute({
 *     component: PluginsLayout,
 *     children: {
 *       installed: defineRoute({ component: InstalledTab }),
 *       search:    defineRoute({ component: SearchTab }),
 *     },
 *   });
 */
export function defineRoute<TParams = void>(def: RouteDef<TParams>): RouteDef<TParams> {
  return def;
}
