/**
 * Bootstrap plugin that runs the {@link MigrationRunner} during
 * `onInit` — *before* any other plugin loads. Migrations may reshape
 * the filesystem (prune orphan plugin-data dirs, rewrite secrets
 * layout, etc.) and must complete before plugin loaders read those
 * paths.
 *
 * Reports are stashed on a singleton so the HTTP layer can surface
 * them in `/api/system/migrations` for the UI banner.
 */

import { inject, singleton } from '@brika/di';
import { brikaContext } from '@/runtime/context/brika-context';
import { Logger } from '@/runtime/logs/log-router';
import { allScopes, type MigrationReport, MigrationRunner } from '@/runtime/migrations';
import { UpdateAuditLog } from '@/runtime/updates/audit-log';
import { VersionStateStore } from '@/runtime/updates/version-state';
import type { BootstrapPlugin } from '../plugin';

@singleton()
export class MigrationStatus {
  #reports: readonly MigrationReport[] = [];
  #completedAt: number | null = null;

  set(reports: readonly MigrationReport[]): void {
    this.#reports = reports;
    this.#completedAt = Date.now();
  }

  get snapshot(): {
    completedAt: number | null;
    reports: readonly MigrationReport[];
  } {
    return { completedAt: this.#completedAt, reports: this.#reports };
  }
}

export function migrations(): BootstrapPlugin {
  return {
    name: 'migrations',
    async onInit() {
      const logs = inject(Logger).withSource('migrations');
      const status = inject(MigrationStatus);
      const runner = new MigrationRunner(allScopes, {
        brikaDir: brikaContext.brikaDir,
        currentVersion: brikaContext.version,
        versionState: new VersionStateStore(brikaContext.brikaDir, brikaContext.version),
        audit: new UpdateAuditLog(brikaContext.brikaDir),
        log: (level, message, data) => {
          if (level === 'info') {
            logs.info(message, data);
          } else if (level === 'warn') {
            logs.warn(message, data);
          } else {
            logs.error(message, data);
          }
        },
      });
      const reports = await runner.run();
      status.set(reports);
      const ran = reports.reduce((sum, r) => sum + r.applied.length, 0);
      if (ran > 0) {
        logs.info('Migrations applied', { totalApplied: ran });
      }
    },
  };
}
