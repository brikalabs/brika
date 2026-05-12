import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import type React from 'react';
import { LoaderScreen } from '@/screens/LoaderScreen';

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

/**
 * Single catch-all route. The hub name lives in `localStorage` (via
 * `@/lib/hub-storage`), so the URL doesn't carry it anymore — the
 * loader screen reads storage and either connects to that hub or
 * shows the landing card. The splat keeps deep links (`/plugins`,
 * `/boards/abc`) intact so the loaded hub UI can route them after
 * the handoff.
 */
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: LoaderScreen,
});

const splatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$',
  component: LoaderScreen,
});

const routeTree = rootRoute.addChildren([indexRoute, splatRoute]);

const router = createRouter({
  routeTree,
  defaultPreload: false,
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
