import "reflect-metadata";
import { container as tsyringeContainer, injectable, singleton } from "tsyringe";
import type { DependencyContainer, InjectionToken } from "tsyringe";

// ─────────────────────────────────────────────────────────────────────────────
// Hot Reload Support: Persist DI container across module reloads
// ─────────────────────────────────────────────────────────────────────────────
const HOT_CONTAINER_KEY = Symbol.for("elia.di.container");

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
