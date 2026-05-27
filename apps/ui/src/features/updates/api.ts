import type { UpdateChannelId } from '@brika/ipc/contract';
import { fetcher } from '@/lib/query';
import { fetchProgressStream, type ProgressStream } from '@/lib/sse-stream';

// Channel catalogue is owned by `@brika/ipc/contract`. Re-export so
// consumers can keep `from '@/features/updates/api'` for the
// full-surface import without reaching into the contract package.
export { UPDATE_CHANNELS, type UpdateChannel, type UpdateChannelId } from '@brika/ipc/contract';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface HubUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  devBuild: boolean;
  /**
   * Local hub is on a pre-release tag (e.g. `0.5.0-rc.1`) and the selected
   * channel is `stable` (which reports an older version). Use this to show
   * "switch back to canary" guidance instead of generic dev-build copy.
   */
  channelMismatch: boolean;
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

export interface CompatPluginEntry {
  name: string;
  currentRequires: string | null;
  willBeCompatible: boolean;
}

export interface CompatReport {
  targetVersion: string;
  plugins: readonly CompatPluginEntry[];
  willDisableCount: number;
  missingRequirementsCount: number;
}

export const updateApi = {
  /** Check for available hub updates (uses the hub's TTL-cached result). */
  check: () => fetcher<HubUpdateInfo>('/api/system/update'),

  /**
   * Force a fresh remote check that bypasses the hub's TTL cache.
   * Used by the "Check now" button so the user gets a real network
   * round-trip — without it, the response is whatever the background
   * checker has held for up to 6 hours.
   */
  checkRefresh: () => fetcher<HubUpdateInfo>('/api/system/update?refresh=true'),

  /** Pre-flight compatibility against the latest available version. */
  compat: () => fetcher<CompatReport>('/api/system/update/compat'),

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
  compat: ['system', 'update', 'compat'] as const,
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
  getPinnedVersion: () =>
    fetcher<{ version: string | null }>('/api/settings/update-pinned-version'),
  setPinnedVersion: (version: string | null) =>
    fetcher<{ version: string | null }>('/api/settings/update-pinned-version', {
      method: 'PUT',
      body: JSON.stringify({ version }),
    }),
};

export const pinnedVersionKeys = {
  all: ['settings', 'update-pinned-version'] as const,
};
