/**
 * Standalone strategy — single `bun --compile` binary that owns its
 * install dir and can replace itself in-place. This is the default
 * shape for `~/.brika/bin/brika`.
 *
 * Delegates to the legacy `applyUpdate` in `@/updater` for now; the
 * staged-install + self-check work lands in a follow-up commit
 * without changing the strategy boundary.
 */

import { applyUpdate, checkForUpdate, type UpdateInfo } from '@/runtime/updates/updater';
import type { UpdateChannelId } from '../channels';
import type { StrategyApplyOptions, StrategyApplyResult, UpdateStrategy } from './strategy';

export class StandaloneStrategy implements UpdateStrategy {
  readonly name = 'standalone';

  canApply(): boolean {
    return true;
  }

  check(channel: UpdateChannelId): Promise<UpdateInfo> {
    return checkForUpdate(channel);
  }

  apply(options: StrategyApplyOptions): Promise<StrategyApplyResult> {
    return applyUpdate({
      force: options.force,
      channel: options.channel,
      pinnedVersion: options.pinnedVersion,
      onProgress: options.onProgress,
    });
  }
}
