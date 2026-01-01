import "reflect-metadata";
import { container, injectable, singleton } from "tsyringe";
import type { DependencyContainer, InjectionToken } from "tsyringe";

export { container, singleton, injectable };
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
