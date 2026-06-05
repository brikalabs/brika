/**
 * System-package strategy — refuses self-apply because the binary
 * lives in a path owned by the OS package manager (apt, dnf, brew,
 * pacman, …). Overwriting it would either fail (read-only fs / wrong
 * uid) or work but get clobbered on the next `apt upgrade`.
 *
 * `check()` still resolves so the UI can show "newer version
 * upstream" — useful when the distro package lags behind GitHub.
 */

import type { UpdateChannelId } from '../channels';
import { checkForUpdate, type UpdateInfo } from '../updater';
import {
  type StrategyApplyOptions,
  type StrategyApplyResult,
  UpdateRefusedError,
  type UpdateStrategy,
} from './strategy';

const GUIDANCE =
  'Brika was installed via your system package manager. Update through that manager ' +
  '(e.g. `brew upgrade brika`, `apt upgrade brika`) rather than overwriting the binary in place.';

export class SystemPackageStrategy implements UpdateStrategy {
  readonly name = 'system-package';

  canApply(): boolean {
    return false;
  }

  check(channel: UpdateChannelId): Promise<UpdateInfo> {
    return checkForUpdate(channel);
  }

  apply(_options: StrategyApplyOptions): Promise<StrategyApplyResult> {
    return Promise.reject(new UpdateRefusedError('UPDATE_SYSTEM_PACKAGE', GUIDANCE));
  }
}
