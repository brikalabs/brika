/**
 * Type machinery for the tiny TUI router. Public surface is in
 * `index.ts`; this file holds the generic plumbing that keeps the
 * `navigate(name, params)` call site type-safe.
 *
 * Design follows TanStack Router's spirit (declarative, typed
 * params per route) but drops everything that doesn't make sense in
 * a single-process TUI: URLs, history APIs, loaders, deferred state,
 * search params. A route is just a name with optional params and
 * optional nested children, and `current` is the top-level tagged
 * union (with `path` exposing the full nested chain).
 */

import type React from 'react';

/**
 * Declaration of a single route. `params` carries the params type via
 * a phantom field — declared `undefined` so it doesn't materialize at
 * runtime, but readable at the type level for `defineRoute<TParams>`.
 *
 * The component is typed as `ComponentType<any>` rather than threading
 * `TParams` through. Reason: in a heterogeneous {@link RoutesShape}
 * record, React's `ComponentType<TParams>` is invariant in TParams
 * which prevents a `RouteDef<void>` from being assignable to a
 * `RouteDef<any>` slot. Type safety is preserved where it matters
 * (at the `navigate(name, params)` call site, via the `params`
 * phantom) — the component just receives whatever the route table
 * says, which is exactly the shape `defineRoute<T>` declared.
 */
export interface RouteDef<TParams = void> {
  /** Phantom marker so TS can infer params from a `RouteDef<T>`. */
  readonly params?: TParams;
  /**
   * Component the {@link Outlet} renders when this route is active.
   * Optional — leave it out for "state-machine-only" routes where the
   * parent does explicit dispatch on `router.current.name` rather
   * than relying on `<Outlet />`. The route still benefits from
   * type-safe `navigate(name, params)` and the history stack.
   *
   * When `children` is set, this `component` acts as the layout — it
   * should render a nested `<Outlet />` somewhere, which the router
   * then fills with the active child's component.
   */
  // biome-ignore lint/suspicious/noExplicitAny: variance — see comment above
  readonly component?: React.ComponentType<any>;
  /**
   * Nested route table. When set, this route is a branch — navigate
   * to one of its children via `navigatePath(['parent', 'child'])`
   * (or by mounting a `<Tabs router>` inside the layout, which binds
   * the active tab to the path segment automatically).
   *
   * Single-level nesting is supported recursively, so you can build
   * route trees as deep as you need.
   */
  readonly children?: RoutesShape;
}

/**
 * Map of route name → definition. Uses `RouteDef<any>` for the same
 * variance reason: routes with different param shapes have to coexist
 * in one record without TypeScript over-constraining the slot type.
 */
// biome-ignore lint/suspicious/noExplicitAny: variance — see comment above
export type RoutesShape = Record<string, RouteDef<any>>;

/**
 * Extract the params type for a given route. Falls back to `void`
 * when the route was declared without params.
 */
export type ParamsOf<R extends RoutesShape, K extends keyof R> =
  R[K] extends RouteDef<infer P> ? P : never;

/**
 * Active-route tagged union — the TOP-LEVEL segment of the active
 * path. For each route name, builds a variant with that `name` and
 * the route's params (or an absent params field when the route takes
 * none). To inspect nested children, read `router.path` instead.
 */
export type ActiveRoute<R extends RoutesShape> = {
  [K in keyof R]: ParamsOf<R, K> extends void
    ? { readonly name: K }
    : { readonly name: K; readonly params: ParamsOf<R, K> };
}[keyof R];

/**
 * The third argument of `navigate(name, ?)` — `[]` when the route
 * has no params (call as `navigate('main')`), `[ParamsOf<...>]`
 * otherwise (call as `navigate('input', { serviceId: 'hub' })`).
 */
export type NavigateArgs<R extends RoutesShape, K extends keyof R> =
  ParamsOf<R, K> extends void ? [] : [ParamsOf<R, K>];

/** One node of an active route path. The leaf carries the params of
 *  its leaf route (when any); intermediate nodes are bare names. */
export interface RouteSegment {
  readonly name: string;
  readonly params?: unknown;
}

/** Active path from root → leaf. Always non-empty. */
export type RoutePath = readonly [RouteSegment, ...RouteSegment[]];

/** Listener fired after every successful navigation. */
export type RouterListener = () => void;

/** Public router surface. */
export interface Router<R extends RoutesShape> {
  /** The route record this router was built with (kept for the Outlet). */
  readonly routes: R;
  /**
   * Currently active TOP-LEVEL route + its params. This is `path[0]`
   * with the original tagged-union typing preserved so existing
   * `router.current.name === '…'` checks stay narrowed. To inspect a
   * nested branch, read `router.path` instead.
   */
  readonly current: ActiveRoute<R>;
  /** Full active path, root → leaf. Always at least one segment. */
  readonly path: RoutePath;
  /**
   * Push a new top-level route. Type-checked: routes with params
   * demand the params arg; routes without forbid it. Activating a
   * nested child uses {@link navigatePath} instead.
   */
  navigate<K extends keyof R>(name: K, ...args: NavigateArgs<R, K>): void;
  /**
   * Push a full nested path. Each segment names a child of the
   * previous segment's route. Used by `<Tabs router>` and by views
   * that want to deep-link into a sub-route directly.
   *
   * Pass `{ replace: true }` to overwrite the current history entry
   * instead of pushing a new one — needed for "redirect to default
   * child" flows so `back()` doesn't bounce back into the redirect.
   */
  navigatePath(path: RoutePath, options?: { readonly replace?: boolean }): void;
  /** Pop the top entry. No-op when the stack is at its root. */
  back(): void;
  /** Subscribe to route changes. Returns an unsubscribe function. */
  subscribe(listener: RouterListener): () => void;
}
