/**
 * Inject Function
 *
 * Angular-style inject() for property initializers.
 */

import type { InjectionToken } from 'tsyringe';
import { container } from './container';

/**
 * Angular-style inject() - use as property initializer.
 *
 * @example
 * ```ts
 * class MyService {
 *   private readonly logs = inject(Logger);
 * }
 * ```
 */
export function inject<T>(token: InjectionToken<T>): T {
  return container.resolve<T>(token);
}
