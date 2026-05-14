/**
 * React glue: a context that holds the router instance.
 *
 * The router itself is plain JS (no React) so it can be tested
 * without rendering. Re-render plumbing is handled by `useRouter()`
 * via `useSyncExternalStore` — each consumer subscribes itself to
 * the router's listener set. Crucially this avoids the
 * "Context.Provider value never changes by reference, so consumers
 * never re-render even though the router's internal state did"
 * gotcha that bites every naïve observable-in-context pattern.
 */

import type React from 'react';
import { createContext } from 'react';
import type { Router, RoutesShape } from './types';

// `any` here is unavoidable: a single Context shape has to fit every
// router shape callers might build. Public consumers go through
// `useRouter<R>()` which re-applies the generic.
// biome-ignore lint/suspicious/noExplicitAny: see comment above
export const RouterContext = createContext<Router<any> | null>(null);

export interface RouterProviderProps<R extends RoutesShape> {
  readonly router: Router<R>;
  readonly children?: React.ReactNode;
}

export function RouterProvider<R extends RoutesShape>({
  router,
  children,
}: Readonly<RouterProviderProps<R>>): React.ReactElement {
  return <RouterContext.Provider value={router}>{children}</RouterContext.Provider>;
}
