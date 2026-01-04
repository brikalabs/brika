import 'reflect-metadata';
import type { DependencyContainer, InjectionToken } from 'tsyringe';
import { injectable, singleton, container as tsyringeContainer } from 'tsyringe';

// ─────────────────────────────────────────────────────────────────────────────
// Hot Reload Support: Persist DI container across module reloads
// ─────────────────────────────────────────────────────────────────────────────
const HOT_CONTAINER_KEY = Symbol.for('brika.di.container');

function getOrCreateContainer(): DependencyContainer {
  const existing = (globalThis as Record<symbol, DependencyContainer>)[HOT_CONTAINER_KEY];
  if (existing) {
    return existing;
  }
  (globalThis as Record<symbol, DependencyContainer>)[HOT_CONTAINER_KEY] = tsyringeContainer;
  return tsyringeContainer;
}

export const container = getOrCreateContainer();
export { singleton, injectable };
export const Injectable = injectable;
export const Singleton = singleton;
export type { DependencyContainer, InjectionToken };

/**
 * Angular-style inject() - use as property initializer
 *
 * @example
 * class MyService {
 *   private readonly logs = inject(LogRouter);
 * }
 */
export function inject<T>(token: InjectionToken<T>): T {
  return container.resolve<T>(token);
}
