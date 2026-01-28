/**
 * DI Container
 *
 * Re-exports from tsyringe for dependency injection with hot reload support.
 */

import 'reflect-metadata';
import {
  type DependencyContainer,
  type InjectionToken,
  injectable,
  singleton,
  container as tsyringeContainer,
} from 'tsyringe';

export type { DependencyContainer, InjectionToken };
export { injectable, singleton };

// ─────────────────────────────────────────────────────────────────────────────
// Hot Reload Support: Persist DI container across module reloads
// ─────────────────────────────────────────────────────────────────────────────

const HOT_CONTAINER_KEY = Symbol.for('brika.di.container');

function getOrCreateContainer() {
  const existing = (globalThis as Record<symbol, typeof tsyringeContainer>)[HOT_CONTAINER_KEY];
  if (existing) return existing;
  (globalThis as Record<symbol, typeof tsyringeContainer>)[HOT_CONTAINER_KEY] = tsyringeContainer;
  return tsyringeContainer;
}

export const container = getOrCreateContainer();
