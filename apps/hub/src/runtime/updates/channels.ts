export type UpdateChannelId = 'stable' | 'canary';

export interface UpdateChannel {
  readonly id: UpdateChannelId;
  readonly label: string;
  readonly description: string;
}

export const UPDATE_CHANNELS: readonly UpdateChannel[] = [
  { id: 'stable', label: 'Stable', description: 'Tested releases, recommended for most users.' },
  { id: 'canary', label: 'Canary', description: 'Latest pre-releases. May be unstable.' },
] as const;

export const DEFAULT_CHANNEL_ID: UpdateChannelId = 'stable';

// Derived tuple for Zod z.enum() — always in sync with UPDATE_CHANNELS
export const UPDATE_CHANNEL_IDS = UPDATE_CHANNELS.map((c) => c.id) as [
  UpdateChannelId,
  ...UpdateChannelId[],
];

export function resolveChannel(id: string | null | undefined): UpdateChannel {
  return (
    UPDATE_CHANNELS.find((c) => c.id === id) ??
    // biome-ignore lint/style/noNonNullAssertion: DEFAULT_CHANNEL_ID is always present in UPDATE_CHANNELS
    UPDATE_CHANNELS.find((c) => c.id === DEFAULT_CHANNEL_ID)!
  );
}
