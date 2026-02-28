import type { ComponentType } from 'react';
import { lazy } from 'react';
import type { ProtectedRouteDefinition, ProtectedRouteWithChildren } from '@brika/auth/tanstack';
import type { Scope } from '@brika/auth';

/** Create a lazy-loaded route definition (without children) */
export function page<T, const TPath extends string>(opts: {
  path: TPath;
  load: () => Promise<T>;
  select: (mod: T) => ComponentType;
  scopes?: Scope | Scope[];
}): ProtectedRouteDefinition<TPath>;

/** Create a lazy-loaded route definition (with children) */
export function page<T, const TPath extends string, TChildren extends Record<string, ProtectedRouteDefinition<string>>>(opts: {
  path: TPath;
  load: () => Promise<T>;
  select: (mod: T) => ComponentType;
  scopes?: Scope | Scope[];
  children: TChildren;
}): ProtectedRouteWithChildren<TPath> & { children: TChildren };

/** Implementation */
export function page<T>(opts: {
  path: string;
  load: () => Promise<T>;
  select: (mod: T) => ComponentType;
  scopes?: Scope | Scope[];
  children?: Record<string, ProtectedRouteDefinition<string>>;
}) {
  return {
    path: opts.path,
    scopes: opts.scopes,
    children: opts.children,
    component: lazy(() => opts.load().then((mod) => ({ default: opts.select(mod) }))),
  };
}
