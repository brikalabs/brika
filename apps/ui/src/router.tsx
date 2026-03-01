/**
 * Brika UI Router
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
