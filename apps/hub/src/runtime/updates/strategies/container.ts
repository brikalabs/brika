/**
 * Container strategy — refuses self-apply. The operator must pull a
 * new image; replacing the binary inside the container would be
 * silently undone by the next `docker run` / pod restart.
 *
 * `check()` still works so the UI can surface "a new image is
 * available" without misleading the user about how to install it.
 */

import { checkForUpdate, type UpdateInfo } from '@/updater';
import type { UpdateChannelId } from '../channels';
import {
  type StrategyApplyOptions,
  type StrategyApplyResult,
  UpdateRefusedError,
  type UpdateStrategy,
} from './strategy';

const GUIDANCE =
  'Brika is running inside a container — pull a new image instead of self-updating. ' +
  'Example: `docker pull ghcr.io/brikalabs/brika:latest && docker compose up -d`.';

export class ContainerStrategy implements UpdateStrategy {
  readonly name = 'container';

  canApply(): boolean {
    return false;
  }

  check(channel: UpdateChannelId): Promise<UpdateInfo> {
    return checkForUpdate(channel);
  }

  apply(_options: StrategyApplyOptions): Promise<StrategyApplyResult> {
    return Promise.reject(new UpdateRefusedError('UPDATE_CONTAINER', GUIDANCE));
  }
}
