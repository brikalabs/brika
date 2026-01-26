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
  if (existing) {
    return existing;
  }
  (globalThis as Record<symbol, typeof tsyringeContainer>)[HOT_CONTAINER_KEY] = tsyringeContainer;
  return tsyringeContainer;
}

export const container = getOrCreateContainer();

/**
 * Angular-style inject() - use as property initializer
 *
 * @example
 * class MyService {
 *   private readonly logs = inject(Logger);
 * }
 */
export function inject<T>(token: InjectionToken<T>): T {
  return container.resolve<T>(token);
}
