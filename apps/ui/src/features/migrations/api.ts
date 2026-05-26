/**
 * Client-side types + fetchers for the boot-time migration report.
 * Mirrors `apps/hub/src/runtime/migrations/types.ts::MigrationReport`
 * and the response shape of `GET /api/system/migrations`.
 */

import { fetcher } from '@/lib/query';

export interface MigrationReport {
  scope: string;
  applied: readonly string[];
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
 * True when the report contains anything worth surfacing to the user:
 * actually-applied migrations OR a failure. A pure noop boot (every
 * scope skipped) returns false so we don't spam the user with
 * "nothing happened" banners.
 */
export function hasNoteworthyMigrations(status: MigrationStatusResponse | undefined): boolean {
  if (!status) {
    return false;
  }
  return status.reports.some((r) => r.applied.length > 0 || r.failed.length > 0);
}
