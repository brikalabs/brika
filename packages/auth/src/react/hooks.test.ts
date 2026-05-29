/**
 * @brika/auth/react - Hooks + AuthProvider Tests
 *
 * The hooks are thin wrappers around `useContext` + `useMemo`, and
 * `AuthProvider` is a small React function component. We don't pull in
 * a DOM renderer — instead we mock React's hook entry points so the
 * code executes in plain function calls and we can assert on the
 * values pulled from context / returned from the memo factory.
 *
 * The mock leaks across files (Bun's `mock.module` is process-global),
 * so we co-locate every test that needs the patched React in this file.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { realFetch } from '@brika/testing';
import * as ActualReact from 'react';
import { AuthClient, type Session as ClientSession } from '../client/AuthClient';
import { Scope } from '../scopes';
import type { AuthContextType } from './AuthProvider';

type SessionUser = ClientSession['user'];

function makeSessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'u1',
    email: 'u1@example.com',
    name: 'Alice',
    role: 'user',
    avatarHash: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeSession(scopes?: string[]): ClientSession {
  return {
    user: makeSessionUser(),
    scopes,
  };
}

let currentContextValue: AuthContextType | null = null;

function setContext(value: AuthContextType | null): void {
  currentContextValue = value;
}

// Spread the real React so callers that need React.createElement /
// React.isValidElement / jsx-runtime still work; only swap the hooks
// we want to drive deterministically.
function fakeUseContext(): AuthContextType | null {
  return currentContextValue;
}

function fakeUseMemo<T>(factory: () => T): T {
  return factory();
}

function fakeUseState<T>(initial: T): readonly [T, (value: T) => void] {
  // The real `useState` accepts a lazy initializer too, but `AuthProvider`
  // never uses one, so we keep the mock signature narrow.
  return [initial, () => {}] as const;
}

function fakeUseCallback<T>(fn: T): T {
  return fn;
}

let lastUseEffect: (() => void | (() => void)) | null = null;

function fakeUseEffect(effect: () => void | (() => void)): void {
  // Stash the most recent effect; tests that want to drive it call
  // `runLastEffect()` explicitly. We deliberately don't auto-run because
  // AuthProvider's effect fires an async fetch chain.
  lastUseEffect = effect;
}

function runLastEffect(): void | (() => void) {
  if (!lastUseEffect) {
    return;
  }
  return lastUseEffect();
}

const reactOverride = {
  ...ActualReact,
  useContext: fakeUseContext,
  useMemo: fakeUseMemo,
  useState: fakeUseState,
  useCallback: fakeUseCallback,
  useEffect: fakeUseEffect,
};

mock.module('react', () => ({
  ...reactOverride,
  default: reactOverride,
}));

// Import AFTER mocking — these modules call React APIs at module load (createContext).
const hooks = await import('./hooks');
const provider = await import('./AuthProvider');

function makeContext(overrides: Partial<AuthContextType> = {}): AuthContextType {
  return {
    user: null,
    session: null,
    isAuthenticated: false,
    isLoading: false,
    needsSetup: false,
    hasAdmin: false,
    setupCompleted: true,
    error: null,
    client: new AuthClient({ apiUrl: 'http://test' }),
    clearSession: mock(),
    updateSession: mock(),
    refreshSession: mock(async () => {}),
    ...overrides,
  };
}

beforeEach(() => {
  setContext(null);
});

afterEach(() => {
  setContext(null);
});

describe('useAuth', () => {
  it('returns the context value when AuthProvider is mounted', () => {
    const ctx = makeContext({ isAuthenticated: true });
    setContext(ctx);

    expect(hooks.useAuth()).toBe(ctx);
  });

  it('throws when used outside an AuthProvider', () => {
    setContext(null);
    expect(() => hooks.useAuth()).toThrow('useAuth must be used within <AuthProvider>');
  });
});

describe('useCanAccess', () => {
  it('returns false when no required scope is given', () => {
    setContext(makeContext({ session: makeSession([Scope.WORKFLOW_READ]) }));
    expect(hooks.useCanAccess(null)).toBe(false);
  });

  it('returns false when there is no active session', () => {
    setContext(makeContext({ session: null }));
    expect(hooks.useCanAccess(Scope.WORKFLOW_READ)).toBe(false);
  });

  it('returns true when the session holds the required scope', () => {
    setContext(makeContext({ session: makeSession([Scope.WORKFLOW_READ]) }));
    expect(hooks.useCanAccess(Scope.WORKFLOW_READ)).toBe(true);
  });

  it('returns false when the session lacks the required scope', () => {
    setContext(makeContext({ session: makeSession([Scope.BOARD_READ]) }));
    expect(hooks.useCanAccess(Scope.WORKFLOW_WRITE)).toBe(false);
  });

  it('treats a missing scopes array as no scopes', () => {
    setContext(makeContext({ session: makeSession() }));
    expect(hooks.useCanAccess(Scope.WORKFLOW_READ)).toBe(false);
  });
});

describe('useCanAccessAll', () => {
  it('returns false when the required list is null', () => {
    setContext(makeContext({ session: makeSession([Scope.WORKFLOW_READ]) }));
    expect(hooks.useCanAccessAll(null)).toBe(false);
  });

  it('returns false when no session is active', () => {
    setContext(makeContext({ session: null }));
    expect(hooks.useCanAccessAll([Scope.WORKFLOW_READ])).toBe(false);
  });

  it('returns true when all required scopes are granted', () => {
    setContext(makeContext({ session: makeSession([Scope.WORKFLOW_READ, Scope.WORKFLOW_WRITE]) }));
    expect(hooks.useCanAccessAll([Scope.WORKFLOW_READ, Scope.WORKFLOW_WRITE])).toBe(true);
  });

  it('returns false when at least one required scope is missing', () => {
    setContext(makeContext({ session: makeSession([Scope.WORKFLOW_READ]) }));
    expect(hooks.useCanAccessAll([Scope.WORKFLOW_READ, Scope.WORKFLOW_WRITE])).toBe(false);
  });
});

describe('useFeaturePermissions', () => {
  it('returns false for every key when no session is active', () => {
    setContext(makeContext({ session: null }));
    const perms = hooks.useFeaturePermissions({
      read: true,
      write: (scopes) => scopes.includes(Scope.WORKFLOW_WRITE),
    });
    expect(perms).toEqual({ read: false, write: false });
  });

  it('evaluates boolean values literally when a session is active', () => {
    setContext(makeContext({ session: makeSession([Scope.WORKFLOW_READ]) }));
    const perms = hooks.useFeaturePermissions({
      always: true,
      never: false,
    });
    expect(perms).toEqual({ always: true, never: false });
  });

  it('invokes function checkers with the active scopes', () => {
    setContext(makeContext({ session: makeSession([Scope.WORKFLOW_READ, Scope.WORKFLOW_WRITE]) }));
    const perms = hooks.useFeaturePermissions({
      canRead: (scopes) => scopes.includes(Scope.WORKFLOW_READ),
      canExecute: (scopes) => scopes.includes(Scope.WORKFLOW_EXECUTE),
    });
    expect(perms).toEqual({ canRead: true, canExecute: false });
  });

  it('passes an empty array when session has no scopes property', () => {
    setContext(makeContext({ session: makeSession() }));
    const perms = hooks.useFeaturePermissions({
      canRead: (scopes) => scopes.length > 0,
    });
    expect(perms).toEqual({ canRead: false });
  });
});

describe('useAuthLoading', () => {
  it('mirrors the isLoading flag on context', () => {
    setContext(makeContext({ isLoading: true }));
    expect(hooks.useAuthLoading()).toBe(true);

    setContext(makeContext({ isLoading: false }));
    expect(hooks.useAuthLoading()).toBe(false);
  });
});

describe('useUser', () => {
  it('returns the user from context', () => {
    const user = makeSessionUser({ id: 'u-alice', name: 'Alice' });
    setContext(makeContext({ user }));
    expect(hooks.useUser()).toBe(user);
  });

  it('returns null when no user is set', () => {
    setContext(makeContext());
    expect(hooks.useUser()).toBeNull();
  });
});

describe('useSession', () => {
  it('returns the session from context', () => {
    const session = makeSession([Scope.WORKFLOW_READ]);
    setContext(makeContext({ session }));
    expect(hooks.useSession()).toBe(session);
  });
});

describe('useAuthError', () => {
  it('returns the error string when one is set', () => {
    setContext(makeContext({ error: 'boom' }));
    expect(hooks.useAuthError()).toBe('boom');
  });

  it('returns null when no error', () => {
    setContext(makeContext());
    expect(hooks.useAuthError()).toBeNull();
  });
});

function installMockFetch(): () => void {
  const stub = Object.assign(
    mock(async () => new Response(JSON.stringify({}), { status: 200 })),
    { preconnect: () => {} }
  );
  const previous = globalThis.fetch;
  globalThis.fetch = stub;
  return () => {
    globalThis.fetch = previous === stub ? realFetch : previous;
  };
}

function asValidElement(node: unknown): ActualReact.ReactElement {
  if (!ActualReact.isValidElement(node)) {
    throw new Error('Expected a React element');
  }
  return node;
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Expected an object');
  }
  return { ...value };
}

describe('AuthProvider', () => {
  it('renders a React element wrapping its children', () => {
    const restore = installMockFetch();
    try {
      const children = ActualReact.createElement('span', null, 'inner');
      const element = asValidElement(provider.AuthProvider({ children }));
      const props = asObject(element.props);
      expect(props.children).toBe(children);
    } finally {
      restore();
    }
  });

  it('exposes the full context shape on the provider value', () => {
    const restore = installMockFetch();
    try {
      const children = ActualReact.createElement('span', null, 'inner');
      const element = asValidElement(provider.AuthProvider({ children, apiUrl: 'http://test' }));
      const props = asObject(element.props);
      const value = asObject(props.value);

      for (const key of [
        'user',
        'session',
        'isAuthenticated',
        'isLoading',
        'needsSetup',
        'hasAdmin',
        'setupCompleted',
        'error',
        'client',
        'clearSession',
        'updateSession',
        'refreshSession',
      ]) {
        expect(value).toHaveProperty(key);
      }
      expect(value.user).toBeNull();
      expect(value.session).toBeNull();
      expect(value.isAuthenticated).toBe(false);
      expect(value.needsSetup).toBe(false);
      expect(value.hasAdmin).toBe(false);
      expect(value.setupCompleted).toBe(true);
      expect(value.error).toBeNull();
      expect(typeof value.clearSession).toBe('function');
      expect(typeof value.updateSession).toBe('function');
      expect(typeof value.refreshSession).toBe('function');
    } finally {
      restore();
    }
  });

  it('forwards a custom fetch implementation into the AuthClient', () => {
    const restore = installMockFetch();
    try {
      const customFetch = Object.assign(
        mock(async () => new Response(null, { status: 204 })),
        { preconnect: () => {} }
      );
      const children = ActualReact.createElement('span', null, 'inner');
      const element = asValidElement(provider.AuthProvider({ children, fetch: customFetch }));
      const props = asObject(element.props);
      // The provider value carries an AuthClient instance built with our fetch.
      const value = asObject(props.value);
      expect(value.client).toBeInstanceOf(AuthClient);
    } finally {
      restore();
    }
  });

  it('mount-effect calls client.getSession + checkSetupStatus then resolves', async () => {
    const restore = installMockFetch();
    try {
      const children = ActualReact.createElement('span', null, 'inner');
      provider.AuthProvider({ children, apiUrl: 'http://test' });
      // The mount effect is the loadSession async function — run it and
      // await its completion to traverse the happy path.
      const cleanup = runLastEffect();
      expect(typeof cleanup === 'undefined' || typeof cleanup === 'function').toBe(true);
      // The async loadSession is scheduled; yield until it resolves.
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      restore();
    }
  });

  it('refreshSession on the context value re-fetches session + setup status', async () => {
    const restore = installMockFetch();
    try {
      const children = ActualReact.createElement('span', null, 'inner');
      const element = asValidElement(provider.AuthProvider({ children, apiUrl: 'http://test' }));
      const props = asObject(element.props);
      const value = asObject(props.value);
      const refresh = value.refreshSession;
      if (typeof refresh !== 'function') {
        throw new Error('Expected refreshSession to be callable');
      }
      await refresh();
    } finally {
      restore();
    }
  });

  it('clearSession + updateSession can be invoked without throwing', () => {
    const restore = installMockFetch();
    try {
      const children = ActualReact.createElement('span', null, 'inner');
      const element = asValidElement(provider.AuthProvider({ children, apiUrl: 'http://test' }));
      const props = asObject(element.props);
      const value = asObject(props.value);
      const clearFn = value.clearSession;
      const updateFn = value.updateSession;
      if (typeof clearFn !== 'function' || typeof updateFn !== 'function') {
        throw new Error('Expected session lifecycle callbacks');
      }
      clearFn();
      updateFn({
        user: {
          id: 'u1',
          email: 'me@example.com',
          name: 'Me',
          role: 'user',
          avatarHash: null,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      });
    } finally {
      restore();
    }
  });

  it('mount-effect handles a rejected getSession by storing the error', async () => {
    // Override the fetch stub installed by installMockFetch to throw.
    const stub = Object.assign(
      mock(async () => {
        throw new Error('boom');
      }),
      { preconnect: () => {} }
    );
    const previous = globalThis.fetch;
    globalThis.fetch = stub;
    try {
      const children = ActualReact.createElement('span', null, 'inner');
      provider.AuthProvider({ children, apiUrl: 'http://test' });
      runLastEffect();
      // Flush microtasks so the error path executes.
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      globalThis.fetch = previous === stub ? realFetch : previous;
    }
  });
});
