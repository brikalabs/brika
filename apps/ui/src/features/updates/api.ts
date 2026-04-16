import { fetcher } from '@/lib/query';
import { fetchProgressStream, type ProgressStream } from '@/lib/sse-stream';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

// Mirrors apps/hub/src/runtime/updates/channels.ts — extend both when adding channels
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

export interface HubUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  devBuild: boolean;
  releaseUrl: string;
  releaseNotes: string;
  publishedAt: string;
  releaseCommit: string;
  currentCommit: string;
  assetName: string | null;
  assetSize: number | null;
  lastCheckedAt: number;
  channel: UpdateChannelId;
}

export interface UpdateProgress {
  phase:
    | 'checking'
    | 'downloading'
    | 'verifying'
    | 'extracting'
    | 'installing'
    | 'restarting'
    | 'complete'
    | 'error';
  message: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

export const updateApi = {
  /** Check for available hub updates */
  check: () => fetcher<HubUpdateInfo>('/api/system/update'),

  /** Apply update with SSE progress streaming. Pass force=true to reinstall current version. */
  applyStream: (options?: { force?: boolean }): Promise<ProgressStream<UpdateProgress>> =>
    fetchProgressStream<UpdateProgress>('/api/system/update/apply', {
      query: {
        force: options?.force,
      },
    }),
};

export const updateKeys = {
  check: ['system', 'update'] as const,
};

export const channelKeys = {
  all: ['settings', 'update-channel'] as const,
};

export const channelApi = {
  get: () => fetcher<{ channel: UpdateChannelId }>('/api/settings/update-channel'),
  set: (channel: UpdateChannelId) =>
    fetcher<{ channel: UpdateChannelId }>('/api/settings/update-channel', {
      method: 'PUT',
      body: JSON.stringify({ channel }),
    }),
};
