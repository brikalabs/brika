/**
 * Type machinery for the tiny TUI router. Public surface is in
 * `index.ts`; this file holds the generic plumbing that keeps the
 * `navigate(name, params)` call site type-safe.
 *
 * Design follows TanStack Router's spirit (declarative, typed
 * params per route) but drops everything that doesn't make sense in
 * a single-process TUI: URLs, history APIs, route trees, loaders,
 * deferred state, search params. A route is just a name with an
 * optional params shape, and `current` is a tagged union.
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
   */
  // biome-ignore lint/suspicious/noExplicitAny: variance — see comment above
  readonly component?: React.ComponentType<any>;
  /**
   * Optional wrapping layout. When present, the {@link Outlet} at the
   * top level renders this layout; the layout in turn renders a
   * nested `<Outlet />` that picks up the route's `component`. Use it
   * for shared chrome (header / sidebar / footer) across a set of
   * routes; omit for full-screen views (shutdown / splash).
   *
   * Single-level nesting only — keeps the mental model simple and
   * matches what 90% of TUIs actually need.
   */
  readonly layout?: React.ComponentType;
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
 * Active-route tagged union. For each route name, builds a variant
 * with that `name` and the route's params (or an absent params field
 * when the route takes none).
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

/** Listener fired after every successful navigation. */
export type RouterListener = () => void;

/** Public router surface. */
export interface Router<R extends RoutesShape> {
  /** The route record this router was built with (kept for the Outlet). */
  readonly routes: R;
  /** Currently active route + its params. */
  readonly current: ActiveRoute<R>;
  /**
   * Push a new route onto the history stack. Type-checked: routes
   * with params demand the params arg; routes without forbid it.
   */
  navigate<K extends keyof R>(name: K, ...args: NavigateArgs<R, K>): void;
  /** Pop the top entry. No-op when the stack is at its root. */
  back(): void;
  /** Subscribe to route changes. Returns an unsubscribe function. */
  subscribe(listener: RouterListener): () => void;
}
