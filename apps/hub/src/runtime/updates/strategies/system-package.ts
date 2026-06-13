/**
 * System-package strategy: refuses self-apply because the binary is owned by a
 * package manager. Two flavors, distinguished only by the guidance wording:
 *   - 'os': an OS package manager (apt, dnf, brew, pacman) put the binary in a
 *     system prefix; overwriting it fails (read-only fs / wrong uid) or works
 *     but gets clobbered on the next `apt upgrade`.
 *   - 'managed': a JS package manager (npm/pnpm/yarn/bun) installed the binary
 *     into node_modules via the `brika` launcher; a reinstall there would wipe
 *     an in-place swap.
 *
 * `check()` still resolves so the UI can show a newer upstream version (useful
 * when the packaged version lags behind GitHub).
 */

import type { UpdateChannelId } from '../channels';
import { checkForUpdate, type UpdateInfo } from '../updater';
import {
  type StrategyApplyOptions,
  type StrategyApplyResult,
  UpdateRefusedError,
  type UpdateStrategy,
} from './strategy';

/** Which package manager owns the binary, so the refusal points at the right upgrade command. */
export type SystemPackageKind = 'os' | 'managed';

const OS_GUIDANCE =
  'Brika was installed via your system package manager. Update through that manager ' +
  '(e.g. `brew upgrade brika`, `apt upgrade brika`) rather than overwriting the binary in place.';

const MANAGED_GUIDANCE =
  'Brika was installed via a JavaScript package manager. Update with the one you installed ' +
  'it with, e.g. `npm i -g brika@latest` (or `pnpm add -g brika`, `bun add -g brika`, ' +
  '`yarn global upgrade brika`), rather than overwriting the binary in place.';

export class SystemPackageStrategy implements UpdateStrategy {
  readonly name = 'system-package';
  readonly #guidance: string;

  constructor(kind: SystemPackageKind = 'os') {
    this.#guidance = kind === 'managed' ? MANAGED_GUIDANCE : OS_GUIDANCE;
  }

  canApply(): boolean {
    return false;
  }

  check(channel: UpdateChannelId): Promise<UpdateInfo> {
    return checkForUpdate(channel);
  }

  apply(_options: StrategyApplyOptions): Promise<StrategyApplyResult> {
    return Promise.reject(new UpdateRefusedError('UPDATE_SYSTEM_PACKAGE', this.#guidance));
  }
}
