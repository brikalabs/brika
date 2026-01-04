import type { RouteDefinition } from './types';

/**
 * Normalize a path prefix.
 */
function normalizePrefix(prefix: string): string {
  if (!prefix) return '';
  const withLeadingSlash = prefix.startsWith('/') ? prefix : `/${prefix}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

/**
 * Apply a prefix to routes.
 */
function applyPrefix(routes: RouteDefinition[], prefix: string): RouteDefinition[] {
  if (!prefix) return routes;
  const cleanPrefix = normalizePrefix(prefix);

  return routes.map((route) => ({
    ...route,
    path: route.path === '/' ? cleanPrefix : `${cleanPrefix}${route.path}`,
  }));
}

/**
 * Group routes under a common prefix.
 *
 * @example
 * ```ts
 * export const userRoutes = group("/users", [
 *   route.get("/", handler),        // GET /users
 *   route.get("/:id", handler),     // GET /users/:id
 *   route.post("/", handler),       // POST /users
 * ]);
 * ```
 */
export function group(prefix: string, routes: RouteDefinition[]): RouteDefinition[] {
  return applyPrefix(routes, prefix);
}

/**
 * Options for combineRoutes.
 */
export interface CombineOptions {
  /** Optional prefix to apply to all routes (e.g., "/api" or "/api/v1") */
  prefix?: string;
}

/**
 * Combine multiple route groups into a single array.
 * Optionally apply a common prefix to all routes.
 *
 * @example
 * ```ts
 * // Without prefix
 * export const allRoutes = combineRoutes(
 *   healthRoutes,
 *   userRoutes,
 *   postRoutes,
 * );
 *
 * // With prefix
 * export const allRoutes = combineRoutes(
 *   { prefix: "/api/v1" },
 *   healthRoutes,
 *   userRoutes,
 *   postRoutes,
 * );
 * ```
 */
export function combineRoutes(...args: (RouteDefinition[] | CombineOptions)[]): RouteDefinition[] {
  // Check if first arg is options
  const firstArg = args[0];
  const hasOptions =
    firstArg && !Array.isArray(firstArg) && typeof firstArg === 'object' && 'prefix' in firstArg;

  const options: CombineOptions = hasOptions ? (firstArg as CombineOptions) : {};
  const routeArrays = hasOptions
    ? (args.slice(1) as RouteDefinition[][])
    : (args as RouteDefinition[][]);

  // Flatten all route arrays
  const allRoutes = routeArrays.flat();

  // Apply prefix if provided
  return options.prefix ? applyPrefix(allRoutes, options.prefix) : allRoutes;
}
