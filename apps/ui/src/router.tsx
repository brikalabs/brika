/**
 * Brika UI Router
 */

import { createRouter, RouterProvider } from '@tanstack/react-router';
import { Suspense } from 'react';
import { DefaultErrorComponent } from '@/components/default-error-component';
import { NotFoundPage } from '@/components/errors';
import { routeTree } from './routes';

export { routes } from './routes';

/**
 * When the UI is served via the remote-access bootstrap
 * (`hub.brika.dev/<name>/...`) we route under `/<name>` as a basepath
 * so every navigation stays prefixed with the hub name. Without this,
 * `<Link to="/plugins">` would replace the URL with `/plugins`, losing
 * the hub identifier — F5 then hits the bootstrap with a URL whose
 * first segment is `plugins`, which the bootstrap tries (and fails) to
 * claim as a hub name.
 *
 * Detection order matches `lib/api/index.ts#detectRemote`:
 *   1. `<meta name="brika:hub" content="<name>">` (worker-stamped)
 *   2. `?hub=<name>` query parameter
 *   3. `hub.brika.dev/<name>/...` pathname prefix
 *
 * Returns `undefined` (default basepath `/`) on LAN / dev hosts.
 */
function detectBasepath(): string | undefined {
  if (typeof document === 'undefined' || typeof globalThis.location === 'undefined') {
    return undefined;
  }
  const metaHub = document.querySelector('meta[name="brika:hub"]')?.getAttribute('content');
  if (metaHub) {
    return `/${metaHub}`;
  }
  const loc = globalThis.location;
  const queryHub = new URL(loc.href).searchParams.get('hub');
  if (queryHub) {
    return `/${queryHub}`;
  }
  if (loc.hostname.toLowerCase() === 'hub.brika.dev') {
    const first = loc.pathname.split('/').find((segment) => segment.length > 0);
    if (first) {
      return `/${first}`;
    }
  }
  return undefined;
}

export const router = createRouter({
  routeTree,
  basepath: detectBasepath(),
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
