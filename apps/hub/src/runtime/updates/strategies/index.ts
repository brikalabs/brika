/**
 * Strategy factory — maps a {@link RuntimeMode} to its concrete
 * {@link UpdateStrategy}. The hub picks the strategy once at boot;
 * tests inject their own via the orchestrator's constructor.
 */

import type { RuntimeMode } from '../runtime-mode';
import { ContainerStrategy } from './container';
import { DevStrategy } from './dev';
import { StandaloneStrategy } from './standalone';
import type { UpdateStrategy } from './strategy';
import { SystemPackageStrategy } from './system-package';

export { ContainerStrategy } from './container';
export { DevStrategy } from './dev';
export { StandaloneStrategy } from './standalone';
export {
  type RefusalCode,
  type StrategyApplyOptions,
  type StrategyApplyResult,
  UpdateRefusedError,
  type UpdateStrategy,
} from './strategy';
export { type SystemPackageKind, SystemPackageStrategy } from './system-package';

export function strategyForMode(
  mode: RuntimeMode,
  opts?: { readonly managed?: boolean }
): UpdateStrategy {
  switch (mode) {
    case 'standalone':
    case 'supervised':
      // Supervised installs use the same in-place swap as standalone
      // today; the supervisor's "restart on exit" loop handles the
      // restart phase. The split into a distinct strategy lands when
      // we add the staged `brika.next` swap that requires supervisor
      // cooperation.
      return new StandaloneStrategy();
    case 'container':
      return new ContainerStrategy();
    case 'system-package':
      // `managed` (npm/pnpm/yarn/bun) vs an OS package only changes the
      // refusal wording, so the user is pointed at the right upgrade command.
      return new SystemPackageStrategy(opts?.managed ? 'managed' : 'os');
    case 'dev':
      return new DevStrategy();
  }
}
