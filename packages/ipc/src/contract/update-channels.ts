/**
 * Update channels are part of the hub↔UI contract — the hub publishes
 * the catalogue, the UI renders it (and lets the user switch), and
 * `apps/console` reads it via the CLI. Keeping a single source for
 * the labels + descriptions avoids the "two arrays drifting" bug Sonar
 * picked up between `apps/hub/src/runtime/updates/channels.ts` and
 * `apps/ui/src/features/updates/api.ts`.
 *
 * Lives in `@brika/ipc/contract` because it's a cross-package surface,
 * not because plugins necessarily care — but the contract package is
 * already the shared boundary that hub and UI both import.
 */

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

/** Derived tuple for `z.enum()` — always in sync with `UPDATE_CHANNELS`. */
export const UPDATE_CHANNEL_IDS = UPDATE_CHANNELS.map((c) => c.id) as [
  UpdateChannelId,
  ...UpdateChannelId[],
];
