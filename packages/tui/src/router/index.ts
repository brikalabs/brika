/**
 * Tiny TUI router.
 *
 * Declarative route definitions; one router instance per app; a
 * `useRouter()` hook gives navigate / back / current; an `<Outlet />`
 * renders the active route's component.
 *
 * @example
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
 *   // inside a child:
 *   const router = useRouter<typeof routes>();
 *   router.navigate('input', { serviceId: 'hub' });
 *   if (router.current.name === 'input') {
 *     console.log(router.current.params.serviceId); // typed
 *   }
 */

import type { RouteDef } from './types';

export { type CreateRouterOptions, createRouter } from './createRouter';
export { Outlet } from './Outlet';
export { RouterContext, RouterProvider, type RouterProviderProps } from './Provider';
export type {
  ActiveRoute,
  NavigateArgs,
  ParamsOf,
  RouteDef,
  Router,
  RouterListener,
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
 *   const main = defineRoute({ component: MainContent, layout: AppShell });
 */
export function defineRoute<TParams = void>(def: RouteDef<TParams>): RouteDef<TParams> {
  return def;
}

/**
 * Identity helper for layout components. Optional sugar so layouts
 * declare their shape symmetrically with routes. A layout is just a
 * React component that renders an `<Outlet />` somewhere inside its
 * tree — `defineLayout(Component)` does no runtime work.
 *
 * @example
 *   const AppShell = defineLayout(() => (
 *     <Box flexDirection="column">
 *       <Header />
 *       <Outlet />
 *       <Footer />
 *     </Box>
 *   ));
 */
import type React from 'react';
export function defineLayout(Component: React.ComponentType): React.ComponentType {
  return Component;
}
