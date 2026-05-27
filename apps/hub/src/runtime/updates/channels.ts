/**
 * Channel catalogue lives in `@brika/ipc/contract` — single source so
 * the hub and UI don't drift. This file keeps only the hub-side
 * helpers (predicates that the UI doesn't need to bundle).
 */

export {
  DEFAULT_CHANNEL_ID,
  UPDATE_CHANNEL_IDS,
  UPDATE_CHANNELS,
  type UpdateChannel,
  type UpdateChannelId,
} from '@brika/ipc/contract';

import type { UpdateChannelId } from '@brika/ipc/contract';

/**
 * True when the channel is a "rolling" track that auto-applies. The
 * `pinned` channel is the only non-rolling option — the orchestrator
 * skips background apply when it's selected.
 */
export function isAutoUpdateChannel(channel: UpdateChannelId): boolean {
  return channel !== 'pinned';
}
