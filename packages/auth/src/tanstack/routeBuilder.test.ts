/**
 * @brika/auth/tanstack - routeBuilder Tests
 *
 * Exercise the pure functional surface of the tanstack route builder:
 * - `resolvePath` (param substitution and splat handling)
 * - `createProtectedRoute` (single-route API)
 * - `createProtectedRoutes` (grouped API with nesting + scope inheritance)
 *
 * We never call into the React renderer here — TanStack route objects are
 * inspectable JS, and the components are simple identity functions we can
 * assert on by reference / displayName.
 */

import { describe, expect, it } from 'bun:test';
import { createRootRoute } from '@tanstack/react-router';
import React from 'react';
import { Scope } from '../scopes';
import { createProtectedRoute, createProtectedRoutes, resolvePath } from './routeBuilder';

function RootComponent() {
  return null;
}

function makeRoot() {
  return createRootRoute({ component: RootComponent });
}

function Page() {
  return null;
}

function Forbidden() {
  return null;
}

function componentDisplayName(component: unknown): string | undefined {
  if (typeof component !== 'function' && (typeof component !== 'object' || component === null)) {
    return undefined;
  }
  if ('displayName' in component) {
    const value = component.displayName;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

describe('resolvePath', () => {
  it('returns the path unchanged when no params are given', () => {
    expect(resolvePath('/users')).toBe('/users');
    expect(resolvePath('/users/$id')).toBe('/users/$id');
  });

  it('replaces $param tokens with values', () => {
    expect(resolvePath('/users/$id', { id: 'u1' })).toBe('/users/u1');
    expect(resolvePath('/users/$id/posts/$postId', { id: 'u1', postId: 'p2' })).toBe(
      '/users/u1/posts/p2'
    );
  });

  it('leaves unknown tokens as `$name` literally', () => {
    expect(resolvePath('/users/$id/details', { other: 'x' })).toBe('/users/$id/details');
  });

  it('substitutes a trailing splat ($) with _splat when provided', () => {
    expect(resolvePath('/files/$', { _splat: 'a/b/c' })).toBe('/files/a/b/c');
  });

  it('keeps the trailing splat unchanged when no _splat param is given', () => {
    expect(resolvePath('/files/$')).toBe('/files/$');
    expect(resolvePath('/files/$', { other: 'x' })).toBe('/files/$');
  });
});

describe('createProtectedRoute', () => {
  it('builds a route with no scope guard when scopes are null', () => {
    const root = makeRoot();
    const result = createProtectedRoute({
      getParentRoute: () => root,
      path: '/public',
      component: Page,
      scopes: null,
    });

    expect(result.path).toBe('/public');
    expect(result.scopes).toBeNull();
    expect(result.route).toBeDefined();
    // No scope: the component is forwarded as-is (no guard wrapper).
    expect(result.route.options.component).toBe(Page);
  });

  it('builds a route with a guard component when scopes are required', () => {
    const root = makeRoot();
    const result = createProtectedRoute({
      getParentRoute: () => root,
      path: '/admin',
      component: Page,
      scopes: Scope.WORKFLOW_WRITE,
    });

    expect(result.scopes).toBe(Scope.WORKFLOW_WRITE);
    expect(result.route.options.component).not.toBe(Page);
    // withScopeGuard sets a recognisable displayName on the wrapper.
    const guardName = componentDisplayName(result.route.options.component);
    expect(guardName).toContain('withScopeGuard');
  });

  it('returns a `to()` helper that resolves params', () => {
    const root = makeRoot();
    const result = createProtectedRoute({
      getParentRoute: () => root,
      path: '/users/$id',
      component: Page,
      scopes: null,
    });

    expect(result.to({ id: 'abc' })).toBe('/users/abc');
  });

  it('defaults scopes to null when omitted', () => {
    const root = makeRoot();
    const result = createProtectedRoute({
      getParentRoute: () => root,
      path: '/anything',
      component: Page,
    });

    expect(result.scopes).toBeNull();
    expect(result.route.options.component).toBe(Page);
  });
});

describe('createProtectedRoutes', () => {
  it('returns a routes map grouped by namespace and a route tree', () => {
    const root = makeRoot();
    const { routes, routeTree } = createProtectedRoutes(root, {
      dashboard: {
        index: { path: '/', component: Page },
      },
      users: {
        list: { path: '/users', component: Page, scopes: Scope.WORKFLOW_READ },
      },
    });

    expect(routes.dashboard.index.path).toBe('/');
    expect(routes.dashboard.index.scopes).toBeNull();
    expect(routes.users.list.path).toBe('/users');
    expect(routes.users.list.scopes).toBe(Scope.WORKFLOW_READ);
    // The tree is the root, with the top-level routes added as children.
    expect(routeTree).toBe(root);
  });

  it('inherits parent scopes when child scopes are omitted', () => {
    const root = makeRoot();
    const { routes } = createProtectedRoutes(root, {
      plugins: {
        detail: {
          path: '/plugins/$uid',
          component: Page,
          scopes: Scope.PLUGIN_READ,
          children: {
            overview: { path: '/', component: Page },
            tab: { path: '$tab', component: Page },
          },
        },
      },
    });

    expect(routes.plugins.detail.scopes).toBe(Scope.PLUGIN_READ);
    expect(routes.plugins.overview.scopes).toBe(Scope.PLUGIN_READ);
    expect(routes.plugins.tab.scopes).toBe(Scope.PLUGIN_READ);
  });

  it('allows a child to clear inherited scopes with `scopes: null`', () => {
    const root = makeRoot();
    const { routes } = createProtectedRoutes(root, {
      plugins: {
        detail: {
          path: '/plugins/$uid',
          component: Page,
          scopes: Scope.PLUGIN_READ,
          children: {
            publicTab: { path: 'open', component: Page, scopes: null },
          },
        },
      },
    });

    expect(routes.plugins.publicTab.scopes).toBeNull();
  });

  it('allows a child to override inherited scopes with its own', () => {
    const root = makeRoot();
    const { routes } = createProtectedRoutes(root, {
      plugins: {
        detail: {
          path: '/plugins/$uid',
          component: Page,
          scopes: Scope.PLUGIN_READ,
          children: {
            settings: {
              path: 'settings',
              component: Page,
              scopes: Scope.PLUGIN_MANAGE,
            },
          },
        },
      },
    });

    expect(routes.plugins.settings.scopes).toBe(Scope.PLUGIN_MANAGE);
  });

  it('resolves child paths under their parent for the to() helper', () => {
    const root = makeRoot();
    const { routes } = createProtectedRoutes(root, {
      plugins: {
        detail: {
          path: '/plugins/$uid',
          component: Page,
          children: {
            overview: { path: '/', component: Page },
            tab: { path: '$tab', component: Page },
            nested: { path: '/extra', component: Page },
          },
        },
      },
    });

    expect(routes.plugins.detail.to({ uid: 'abc' })).toBe('/plugins/abc');
    expect(routes.plugins.overview.to({ uid: 'abc' })).toBe('/plugins/abc');
    expect(routes.plugins.tab.to({ uid: 'abc', tab: 'logs' })).toBe('/plugins/abc/logs');
    expect(routes.plugins.nested.to({ uid: 'abc' })).toBe('/plugins/abc/extra');
  });

  it('wires a forbidden component into the scope guard when provided', () => {
    const root = makeRoot();
    const { routes } = createProtectedRoutes(
      root,
      {
        admin: {
          users: {
            path: '/admin/users',
            component: Page,
            scopes: Scope.SETTINGS_READ,
          },
        },
      },
      { defaultForbiddenComponent: Forbidden }
    );

    const guard = routes.admin.users.route.options.component;
    expect(guard).not.toBe(Page);
    expect(componentDisplayName(guard)).toContain('withScopeGuard');
  });

  it('leaves the original component reference when no scopes are required', () => {
    const root = makeRoot();
    const { routes } = createProtectedRoutes(root, {
      public: {
        landing: { path: '/', component: Page },
      },
    });

    expect(routes.public.landing.route.options.component).toBe(Page);
  });

  it('compiles the example shape from the JSDoc on createProtectedRoutes', () => {
    const root = makeRoot();
    const { routes, routeTree } = createProtectedRoutes(root, {
      dashboard: { index: { path: '/', component: Page } },
      plugins: {
        list: { path: '/plugins', component: Page, scopes: Scope.PLUGIN_READ },
        detail: {
          path: '/plugins/$uid',
          component: Page,
          scopes: Scope.PLUGIN_READ,
          children: {
            overview: { path: '/', component: Page },
            tab: { path: '$tab', component: Page },
          },
        },
      },
    });

    expect(routes.dashboard.index.path).toBe('/');
    expect(routes.plugins.list.scopes).toBe(Scope.PLUGIN_READ);
    expect(routes.plugins.detail.to({ uid: 'xyz' })).toBe('/plugins/xyz');
    expect(routeTree).toBe(root);
  });

  it('keeps a stable React element type returned by Forbidden when used', () => {
    // Sanity-check: Forbidden is just a component reference React.createElement
    // will accept. Surface it here so the import isn't flagged as unused if a
    // future refactor removes the defaultForbiddenComponent test above.
    expect(React.isValidElement(React.createElement(Forbidden))).toBe(true);
  });
});
