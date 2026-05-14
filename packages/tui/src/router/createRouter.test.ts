/**
 * Router behavior tests. Render layer is covered by typecheck + the
 * App.tsx integration; here we exercise the state-machine API in
 * isolation (no React mount needed).
 */

import { describe, expect, test } from 'bun:test';
import type React from 'react';
import { createRouter, defineRoute } from './index';
import type { RoutesShape } from './types';

// Sentinel component — never rendered in these tests, just used as
// the `component` for a RouteDef so the type-level shape matches.
const Sentinel: React.ComponentType = () => null;

const routes = {
  main: defineRoute({ component: Sentinel }),
  help: defineRoute({ component: Sentinel }),
  input: defineRoute<{ serviceId: string }>({ component: Sentinel }),
} as const satisfies RoutesShape;

describe('createRouter', () => {
  test('starts on the initial route', () => {
    const r = createRouter({ routes, initial: { name: 'main' } });
    expect(r.current.name).toBe('main');
  });

  test('navigate without params switches the route', () => {
    const r = createRouter({ routes, initial: { name: 'main' } });
    r.navigate('help');
    expect(r.current.name).toBe('help');
  });

  test('navigate with params attaches them to current', () => {
    const r = createRouter({ routes, initial: { name: 'main' } });
    r.navigate('input', { serviceId: 'hub' });
    expect(r.current.name).toBe('input');
    if (r.current.name === 'input') {
      expect(r.current.params.serviceId).toBe('hub');
    }
  });

  test('back() pops to the previous route', () => {
    const r = createRouter({ routes, initial: { name: 'main' } });
    r.navigate('help');
    r.navigate('input', { serviceId: 'a' });
    r.back();
    expect(r.current.name).toBe('help');
    r.back();
    expect(r.current.name).toBe('main');
  });

  test('back() at the root is a no-op (history floor protected)', () => {
    const r = createRouter({ routes, initial: { name: 'main' } });
    r.back();
    r.back();
    expect(r.current.name).toBe('main');
  });

  test('subscribe fires on each navigate; unsubscribe stops the firing', () => {
    const r = createRouter({ routes, initial: { name: 'main' } });
    let count = 0;
    const off = r.subscribe(() => {
      count += 1;
    });
    r.navigate('help');
    r.navigate('main');
    expect(count).toBe(2);
    off();
    r.navigate('help');
    expect(count).toBe(2);
  });

  test('subscribe fires on back() too', () => {
    const r = createRouter({ routes, initial: { name: 'main' } });
    r.navigate('help');
    let count = 0;
    r.subscribe(() => {
      count += 1;
    });
    r.back();
    expect(count).toBe(1);
  });
});
