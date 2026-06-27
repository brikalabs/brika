/**
 * Client-side types + fetchers for the boot-time migration report.
 * Mirrors `apps/hub/src/runtime/migrations/types.ts::MigrationReport`
 * and the response shape of `GET /api/system/migrations`.
 */

import { fetcher } from '@/lib/query';

export interface MigrationReport {
  scope: string;
  applied: readonly string[];
  /** The subset of `applied` that actually changed on-disk state (worth surfacing). */
  changed: readonly string[];
  skipped: readonly string[];
  failed: ReadonlyArray<{ id: string; error: string }>;
  durationMs: number;
}

export interface MigrationStatusResponse {
  completedAt: number | null;
  reports: readonly MigrationReport[];
}

export const migrationKeys = {
  status: ['migrations', 'status'] as const,
};

export const migrationApi = {
  status: () => fetcher<MigrationStatusResponse>('/api/system/migrations'),
};

/**
 * True when the report contains anything worth surfacing to the user: a migration that actually
 * CHANGED on-disk state, OR a failure. A boot that only recorded no-op migrations (a fresh install
 * pruning nothing, or an intentional ledger stamp) returns false, so we never show "state updated" for
 * work that did not happen.
 */
export function hasNoteworthyMigrations(status: MigrationStatusResponse | undefined): boolean {
  if (!status) {
    return false;
  }
  return status.reports.some((r) => r.changed.length > 0 || r.failed.length > 0);
}
