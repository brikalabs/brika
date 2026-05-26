export type UpdateChannelId = 'stable' | 'beta' | 'canary' | 'pinned';

export interface UpdateChannel {
  readonly id: UpdateChannelId;
  readonly label: string;
  readonly description: string;
}

export const UPDATE_CHANNELS: readonly UpdateChannel[] = [
  { id: 'stable', label: 'Stable', description: 'Tested releases, recommended for most users.' },
  {
    id: 'beta',
    label: 'Beta',
    description: 'Release candidates — feature-complete, stabilising for the next stable.',
  },
  { id: 'canary', label: 'Canary', description: 'Latest pre-releases. May be unstable.' },
  {
    id: 'pinned',
    label: 'Pinned',
    description: 'Stay on a specific version; auto-update is disabled.',
  },
] as const;

export const DEFAULT_CHANNEL_ID: UpdateChannelId = 'stable';

// Derived tuple for Zod z.enum() — always in sync with UPDATE_CHANNELS
export const UPDATE_CHANNEL_IDS = UPDATE_CHANNELS.map((c) => c.id) as [
  UpdateChannelId,
  ...UpdateChannelId[],
];

/**
 * True when the channel is a "rolling" track that auto-applies. The
 * `pinned` channel is the only non-rolling option — the orchestrator
 * skips background apply when it's selected.
 */
export function isAutoUpdateChannel(channel: UpdateChannelId): boolean {
  return channel !== 'pinned';
}
