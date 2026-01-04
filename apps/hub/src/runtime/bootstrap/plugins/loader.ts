import { type InjectionToken, inject } from '@elia/shared';
import type { Loader } from '../loader';
import type { BootstrapPlugin } from '../plugin';

/**
 * Wraps a Loader class as a BootstrapPlugin using DI.
 *
 * @example
 * ```ts
 * await bootstrap()
 *   .use(loader(PluginLoader))
 *   .use(loader(RuleLoader))
 *   .start();
 * ```
 */
export function loader(token: InjectionToken<Loader>): BootstrapPlugin {
  const instance = inject(token);

  return {
    name: instance.name,
    onInit: () => instance.init?.(),
    onLoad: (config) => instance.load(config),
    onStop: () => instance.stop?.(),
  };
}
