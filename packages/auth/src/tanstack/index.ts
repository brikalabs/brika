/**
 * @brika/auth/tanstack
 * TanStack Router integration for protected routes
 */

export type {
  ExtractParams,
  NormalizeParam,
  ParamsArg,
  ProtectedRouteDefinition,
  ProtectedRouteResult,
  ProtectedRoutesOptions,
  ProtectedRouteWithChildren,
} from './routeBuilder';
export { createProtectedRoute, createProtectedRoutes, resolvePath } from './routeBuilder';
