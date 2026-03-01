import type { Middleware, RouteDefinition } from './types';

/** Join path segments, collapsing duplicate slashes and stripping trailing slash. */
function joinPath(...segments: string[]): string {
  return segments.join('/').replaceAll(/\/+/g, '/').replace(/\/$/, '');
}

export interface GroupConfig {
  /** Path prefix prepended to all routes in this group. */
  prefix?: string;
  /** Middleware applied to all routes in this group (before per-route middleware). */
  middleware?: Middleware[];
  /** Routes in this group. */
  routes: (RouteDefinition | RouteDefinition[])[];
}

/**
 * Group routes, optionally under a common prefix and/or with shared middleware.
 *
 * @example
 * ```ts
 * // Basic prefix
 * export const userRoutes = group({
 *   prefix: '/users',
 *   routes: [
 *     route.get({ path: '/', handler }),
 *     route.get({ path: '/:id', handler }),
 *   ],
 * });
 *
 * // Prefix + middleware
 * export const adminRoutes = group({
 *   prefix: '/admin',
 *   middleware: [requireScope(Scope.ADMIN_ALL)],
 *   routes: [
 *     route.get({ path: '/users', handler: listUsers }),
 *     route.post({ path: '/users', handler: createUser }),
 *   ],
 * });
 *
 * // Middleware-only (no prefix)
 * export const protectedRoutes = group({
 *   middleware: [requireAuth()],
 *   routes: [userRoutes, settingsRoutes],
 * });
 * ```
 */
export function group(config: GroupConfig): RouteDefinition[] {
  const { prefix = '', middleware: groupMiddleware, routes } = config;

  return routes.flat().map((route) => ({
    ...route,
    ...(prefix && {
      path: joinPath('/', prefix, route.path),
    }),
    ...(groupMiddleware && {
      middleware: [
        ...groupMiddleware,
        ...(route.middleware ?? []),
      ],
    }),
  }));
}

/**
 * Combine multiple route definitions into a single array.
 * Accepts both single routes and arrays.
 *
 * @example
 * ```ts
 * export const allRoutes = combineRoutes(
 *   healthRoutes,
 *   userRoutes,
 *   postRoutes,
 *   singleRoute,
 * );
 * ```
 */
export function combineRoutes(
  ...routes: (RouteDefinition | RouteDefinition[])[]
): RouteDefinition[] {
  return routes.flat();
}
