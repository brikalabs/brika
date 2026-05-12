import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import type React from 'react';
import { LandingScreen } from '@/screens/LandingScreen';
import { LoaderScreen } from '@/screens/LoaderScreen';

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: LandingScreen,
});

/**
 * Anything that LOOKS like `/<hub-name>[/...]` lands on the loader screen.
 * The route param is the first path segment; nested paths are ignored at
 * this layer (the hub's app router will handle them after the handoff).
 */
const hubRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$hubName',
  component: LoaderScreen,
});

const splatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$hubName/$',
  component: LoaderScreen,
});

const routeTree = rootRoute.addChildren([landingRoute, hubRoute, splatRoute]);

const router = createRouter({
  routeTree,
  defaultPreload: false,
  // We rewrite history in-place after a successful claim; never trap.
  basepath: '/',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter(): React.ReactElement {
  return <RouterProvider router={router} />;
}
