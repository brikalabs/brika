/**
 * @brika/auth - TanStack Router Protected Routes
 *
 * Declarative route definitions with nesting, scope inheritance,
 * and automatic route tree building.
 *
 * Auth gating is handled at the RootLayout level (redirect to /login).
 * Scope protection is handled via withScopeGuard HOC.
 */

import React from 'react';
import { createRoute, type AnyRoute, type RouteComponent } from '@tanstack/react-router';
import { Scope } from '../types';
import { withScopeGuard } from '../react/withScopeGuard';

// ─── Path param type extraction ──────────────────────────────────────────────

/** Normalize bare splat `$` to `_splat` (matches TanStack Router convention) */
type NormalizeParam<P extends string> = P extends '' ? '_splat' : P;

/** Extract `$param` names from a path string into a union */
type ExtractParams<T extends string> = T extends `${string}/$${infer Param}/${infer Rest}`
  ? NormalizeParam<Param> | ExtractParams<`/${Rest}`>
  : T extends `${string}/$${infer Param}`
    ? NormalizeParam<Param>
    : never;

/** If the path has params, require them. Otherwise no args needed. */
type ParamsArg<T extends string> = [ExtractParams<T>] extends [never]
  ? []
  : [params: Record<ExtractParams<T>, string>];

// ─── Definition types (input) ────────────────────────────────────────────────

/**
 * A route definition. Pure data — no TanStack-specific callbacks.
 */
export interface ProtectedRouteDefinition<TPath extends string = string> {
  path: TPath;
  /** undefined = inherit parent scopes. null = no scope check. */
  scopes?: Scope | Scope[] | null;
  component: React.ComponentType;
}

/**
 * A route definition that may have nested children.
 * Children inherit parent scopes unless they explicitly set their own.
 */
export interface ProtectedRouteWithChildren<TPath extends string = string>
  extends ProtectedRouteDefinition<TPath> {
  children?: Record<string, ProtectedRouteDefinition<string>>;
}

// ─── Result types (output) ────────────────────────────────────────────────────

/**
 * Result for a single route with navigation + permission metadata.
 */
export interface ProtectedRouteResult<TPath extends string = string> {
  /** The TanStack route object */
  route: AnyRoute;
  /** The URL path pattern */
  path: TPath;
  /** Effective scopes (after inheritance). null = authenticated only. */
  scopes: Scope | Scope[] | null;
  /** Resolve path params to a concrete URL */
  to(...args: ParamsArg<TPath>): string;
}

// ─── Result type mapping ─────────────────────────────────────────────────────

type UnionToIntersection<U> =
  (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

/** Compute the full absolute path for a child route */
type ChildAbsolutePath<Parent extends string, Child extends string> =
  Child extends '/' ? Parent
  : Child extends `/${string}` ? `${Parent}${Child}`
  : `${Parent}/${Child}`;

/** Extract and flatten all children maps into a single intersection */
type FlattenChildren<T> = UnionToIntersection<
  {
    [K in keyof T]: T[K] extends { path: infer PP extends string; children: infer C extends Record<string, ProtectedRouteDefinition> }
      ? { [CK in keyof C]: ProtectedRouteResult<ChildAbsolutePath<PP, C[CK]['path']>> }
      : {};
  }[keyof T]
>;

/** Map a group of definitions to results, flattening children within the group */
type GroupResults<T extends Record<string, ProtectedRouteDefinition | ProtectedRouteWithChildren>> = {
  [K in keyof T]: ProtectedRouteResult<T[K]['path']>;
} & FlattenChildren<T>;

/** Map grouped definitions to nested route results */
type GroupedRouteResults<T extends Record<string, Record<string, ProtectedRouteDefinition | ProtectedRouteWithChildren>>> = {
  [G in keyof T]: GroupResults<T[G]>;
};

// ─── Options ─────────────────────────────────────────────────────────────────

export interface ProtectedRoutesOptions {
  /** Component rendered when a user lacks required scopes (403). */
  defaultForbiddenComponent?: React.ComponentType;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Replace $param segments with actual values (supports splat $) */
function resolvePath(path: string, params?: Record<string, string>): string {
  if (!params) return path;
  let resolved = path.replaceAll(/\$(\w+)/g, (_, key) => params[key] ?? `$${key}`);
  // Handle trailing splat param ($)
  if (resolved.endsWith('/$') && params._splat != null) {
    resolved = resolved.slice(0, -1) + params._splat;
  }
  return resolved;
}

/** Resolve the absolute path for a child route */
function resolveChildPath(parentPath: string, childPath: string): string {
  if (childPath === '/') return parentPath;
  if (childPath.startsWith('/')) return `${parentPath}${childPath}`;
  return `${parentPath}/${childPath}`;
}

/** Build child routes and register them in the group results */
function processChildren(
  children: Record<string, ProtectedRouteDefinition>,
  parentPath: string,
  parentRoute: AnyRoute,
  parentScopes: Scope | Scope[] | null,
  groupResults: Record<string, ProtectedRouteResult>,
  options?: ProtectedRoutesOptions,
): void {
  const childRoutes: AnyRoute[] = [];

  for (const [childKey, childDef] of Object.entries(children)) {
    const childScopes = childDef.scopes === undefined ? parentScopes : (childDef.scopes ?? null);
    const fullChildPath = resolveChildPath(parentPath, childDef.path);
    const childResult = buildRoute(childDef, () => parentRoute, childScopes, options, fullChildPath);

    groupResults[childKey] = childResult;
    childRoutes.push(childResult.route);
  }

  parentRoute.addChildren(childRoutes);
}

/** Create a ProtectedRouteResult from a definition + parent reference */
function buildRoute<TPath extends string>(
  definition: ProtectedRouteDefinition<TPath>,
  getParentRoute: () => AnyRoute,
  effectiveScopes: Scope | Scope[] | null,
  options?: ProtectedRoutesOptions,
  absolutePath?: string,
): ProtectedRouteResult<TPath> {
  const { path, component } = definition;

  const guardOptions = options?.defaultForbiddenComponent
    ? { fallback: React.createElement(options.defaultForbiddenComponent) }
    : undefined;

  const guardedComponent =
    effectiveScopes === null ? component : withScopeGuard(component, effectiveScopes, guardOptions);

  const route = createRoute({
    getParentRoute,
    path: path as string,
    component: guardedComponent as RouteComponent,
  });

  const displayPath = absolutePath ?? path;

  return {
    route: route as AnyRoute,
    path: displayPath as TPath,
    scopes: effectiveScopes,
    to: ((...args: unknown[]) =>
      resolvePath(displayPath, args[0] as Record<string, string> | undefined)
    ) as ProtectedRouteResult<TPath>['to'],
  };
}

// ─── Main API ─────────────────────────────────────────────────────────────────

/**
 * Create protected routes with declarative nesting and scope inheritance.
 *
 * Routes are organized into named groups. Each group becomes a namespace
 * on the returned `routes` object.
 *
 * - Pass rootRoute as first argument
 * - Nest children inline via `children: { ... }`
 * - Children inherit parent scopes (set explicitly to override, or null to clear)
 * - Returns `{ routes, routeTree }` — grouped route map + assembled TanStack tree
 *
 * @example
 * ```ts
 * const { routes, routeTree } = createProtectedRoutes(rootRoute, {
 *   dashboard: { index: page('/') },
 *   plugins: {
 *     list: page('/plugins', ..., Scope.PLUGIN_READ),
 *     detail: {
 *       ...page('/plugins/$uid', ..., Scope.PLUGIN_READ),
 *       children: {
 *         overview: page('/'),  // inherits PLUGIN_READ
 *         tab: page('$tab'),    // inherits PLUGIN_READ
 *       },
 *     },
 *   },
 * });
 *
 * routes.dashboard.index.path  // '/'
 * routes.plugins.list.scopes   // Scope.PLUGIN_READ
 * routes.plugins.detail.to({ uid: '...' })
 * ```
 */
export function createProtectedRoutes<
  const T extends Record<string, Record<string, ProtectedRouteDefinition<string> | ProtectedRouteWithChildren<string>>>,
>(
  rootRoute: AnyRoute,
  groups: T,
  options?: ProtectedRoutesOptions,
): { routes: GroupedRouteResults<T>; routeTree: AnyRoute } {
  const groupedRoutes: Record<string, Record<string, ProtectedRouteResult>> = {};
  const topLevelRoutes: AnyRoute[] = [];

  for (const [groupName, definitions] of Object.entries(groups)) {
    groupedRoutes[groupName] = {};

    for (const [key, definition] of Object.entries(definitions)) {
      const effectiveScopes = definition.scopes ?? null;
      const result = buildRoute(definition, () => rootRoute, effectiveScopes, options);
      groupedRoutes[groupName][key] = result;

      // Process children if present
      const children = (definition as ProtectedRouteWithChildren).children;
      if (children) {
        processChildren(children, definition.path, result.route, effectiveScopes, groupedRoutes[groupName], options);
      }

      topLevelRoutes.push(result.route);
    }
  }

  const routeTree = rootRoute.addChildren(topLevelRoutes);

  return {
    routes: groupedRoutes as GroupedRouteResults<T>,
    routeTree,
  };
}

// ─── Single-route API (advanced use) ─────────────────────────────────────────

/** Definition with explicit getParentRoute for advanced / one-off use. */
export interface LegacyRouteDefinition<TPath extends string = string>
  extends ProtectedRouteDefinition<TPath> {
  getParentRoute: () => AnyRoute;
}

/**
 * Create a single protected route with explicit parent.
 * Prefer createProtectedRoutes() for most use cases.
 */
export function createProtectedRoute<TPath extends string>(
  definition: LegacyRouteDefinition<TPath>,
): ProtectedRouteResult<TPath> {
  const { getParentRoute, ...rest } = definition;
  return buildRoute(rest, getParentRoute, rest.scopes ?? null);
}
