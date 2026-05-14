/**
 * Brika UI Router
 *
 * The remote-access bootstrap now stores the hub name in
 * `localStorage` and stamps it into `<meta name="brika:hub">` before
 * mounting this UI — so the URL no longer carries the hub identifier.
 * Every router path is therefore root-relative on both LAN
 * (`localhost`) and remote (`hub.brika.dev`).
 */

import { createRouter, RouterProvider } from '@tanstack/react-router';
import { Suspense } from 'react';
import { DefaultErrorComponent } from '@/components/default-error-component';
import { NotFoundPage } from '@/components/errors';
import { routeTree } from './routes';

export { routes } from './routes';

export const router = createRouter({
  routeTree,
  defaultErrorComponent: DefaultErrorComponent,
  defaultNotFoundComponent: () => <NotFoundPage />,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export function RouteProvider() {
  return (
    <Suspense
      fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}
    >
      <RouterProvider router={router} />
    </Suspense>
  );
}
