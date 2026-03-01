import { fetcher } from '@/lib/query';
import { fetchProgressStream, type ProgressStream } from '@/lib/sse-stream';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

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
