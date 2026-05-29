/**
 * @brika/auth/react - withScopeGuard / withOptionalScope HOC Tests
 *
 * The HOC produces a tiny wrapper component that calls `useCanAccess`
 * and either renders the child component, the supplied fallback, or
 * the default fallback. We don't need a renderer to exercise it: we
 * mock `useCanAccess` and call the returned component like a normal
 * function, then inspect the resulting React element.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import React from 'react';
import { Scope } from '../scopes';

let canAccessReturn = false;

mock.module('./hooks', () => ({
  useCanAccess: (_: Scope | Scope[] | null) => canAccessReturn,
  useCanAccessAll: () => false,
  useFeaturePermissions: () => ({}),
  useAuth: () => null,
  useAuthLoading: () => false,
  useUser: () => null,
  useSession: () => null,
  useAuthError: () => null,
}));

const withScopeGuardModule = await import('./withScopeGuard');
const { withScopeGuard, withOptionalScope } = withScopeGuardModule;

function NamedComponent(props: Readonly<{ value: string }>) {
  return React.createElement('span', null, props.value);
}

function isFunctionComponent<P>(
  Wrapper: React.ComponentType<P>
): Wrapper is React.FunctionComponent<P> {
  return typeof Wrapper === 'function' && !Wrapper.prototype?.isReactComponent;
}

function callWrapper<P extends object>(
  Wrapper: React.ComponentType<P>,
  props: P
): React.ReactNode | Promise<React.ReactNode> {
  // `React.ComponentType<P>` is a union of class and function components.
  // The HOC always returns a function component, so we narrow with the
  // standard `prototype.isReactComponent` check React itself uses.
  if (!isFunctionComponent(Wrapper)) {
    throw new TypeError('Expected Wrapper to be a function component');
  }
  return Wrapper(props);
}

beforeEach(() => {
  canAccessReturn = false;
});

afterEach(() => {
  canAccessReturn = false;
});

describe('withScopeGuard', () => {
  it('returns a function component with a recognisable displayName', () => {
    const Guarded = withScopeGuard(NamedComponent, Scope.WORKFLOW_READ);
    expect(typeof Guarded).toBe('function');
    expect(Guarded.displayName).toBe('withScopeGuard(NamedComponent)');
  });

  it('uses Component.displayName when present', () => {
    const Comp: React.FC = () => null;
    Comp.displayName = 'PrettyName';

    const Guarded = withScopeGuard(Comp, Scope.WORKFLOW_READ);
    expect(Guarded.displayName).toBe('withScopeGuard(PrettyName)');
  });

  it('falls back to the anonymous string when neither name nor displayName is available', () => {
    // An IIFE returning the inner arrow keeps `.name` empty on the result.
    const Anon: React.FC = (
      (): React.FC => () =>
        null
    )();
    expect(Anon.name).toBe('');

    const Guarded = withScopeGuard(Anon, Scope.WORKFLOW_READ);
    expect(Guarded.displayName).toBe('withScopeGuard()');
  });

  it('renders the wrapped component when canAccess is true', () => {
    canAccessReturn = true;
    const Guarded = withScopeGuard(NamedComponent, Scope.WORKFLOW_READ);

    const element = callWrapper(Guarded, { value: 'ok' });
    expect(React.isValidElement(element)).toBe(true);
    if (!React.isValidElement(element)) {
      throw new Error('Expected a React element');
    }
    expect(element.type).toBe(NamedComponent);
    const props = element.props;
    if (typeof props !== 'object' || props === null || !('value' in props)) {
      throw new Error('Expected props to contain value');
    }
    expect(props.value).toBe('ok');
  });

  it('renders the default fallback when canAccess is false and no fallback is provided', () => {
    canAccessReturn = false;
    const Guarded = withScopeGuard(NamedComponent, Scope.WORKFLOW_READ);
    const element = callWrapper(Guarded, { value: 'denied' });

    // Default fallback is a <div> with "Unauthorized" heading.
    if (!React.isValidElement(element)) {
      throw new Error('Expected the default fallback to be a React element');
    }
    expect(element.type).toBe('div');
  });

  it('renders the supplied fallback when canAccess is false', () => {
    canAccessReturn = false;
    const fallback = React.createElement('p', null, 'nope');
    const Guarded = withScopeGuard(NamedComponent, Scope.WORKFLOW_READ, { fallback });

    const element = callWrapper(Guarded, { value: 'denied' });
    expect(element).toBe(fallback);
  });

  it('renders null when an explicit null fallback is passed', () => {
    canAccessReturn = false;
    const Guarded = withScopeGuard(NamedComponent, Scope.WORKFLOW_READ, { fallback: null });
    const element = callWrapper(Guarded, { value: 'denied' });
    expect(element).toBeNull();
  });
});

describe('withOptionalScope', () => {
  it('renders the wrapped component when canAccess is true', () => {
    canAccessReturn = true;
    const Optional = withOptionalScope(NamedComponent, Scope.ADMIN_ALL);

    const element = callWrapper(Optional, { value: 'visible' });
    if (!React.isValidElement(element)) {
      throw new Error('Expected a React element');
    }
    expect(element.type).toBe(NamedComponent);
  });

  it('renders null when canAccess is false', () => {
    canAccessReturn = false;
    const Optional = withOptionalScope(NamedComponent, Scope.ADMIN_ALL);

    const element = callWrapper(Optional, { value: 'hidden' });
    expect(element).toBeNull();
  });

  it('uses the withScopeGuard display name format', () => {
    const Optional = withOptionalScope(NamedComponent, Scope.ADMIN_ALL);
    expect(Optional.displayName).toBe('withScopeGuard(NamedComponent)');
  });
});
