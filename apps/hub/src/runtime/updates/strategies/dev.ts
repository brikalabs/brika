/**
 * Dev strategy — refuses self-apply when the hub is running from
 * source via `bun run` rather than a compiled binary. `check()` still
 * works for testing the upstream fetch path without triggering an
 * actual binary swap.
 */

import { checkForUpdate, type UpdateInfo } from '@/runtime/updates/updater';
import type { UpdateChannelId } from '../channels';
import {
  type StrategyApplyOptions,
  type StrategyApplyResult,
  UpdateRefusedError,
  type UpdateStrategy,
} from './strategy';

const GUIDANCE =
  'Brika is running from source (dev mode) — there is no compiled binary to replace. ' +
  'Stop the dev server, pull the new sources with `git pull`, and restart.';

export class DevStrategy implements UpdateStrategy {
  readonly name = 'dev';

  canApply(): boolean {
    return false;
  }

  check(channel: UpdateChannelId): Promise<UpdateInfo> {
    return checkForUpdate(channel);
  }

  apply(_options: StrategyApplyOptions): Promise<StrategyApplyResult> {
    return Promise.reject(new UpdateRefusedError('UPDATE_DEV_MODE', GUIDANCE));
  }
}
