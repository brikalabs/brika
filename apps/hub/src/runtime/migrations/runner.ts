/**
 * MigrationRunner — applies pending migrations across all registered
 * scopes. Called from the bootstrap chain before plugins load so any
 * filesystem reshape happens while we own the writes.
 *
 * The runner is intentionally synchronous-in-spirit: scopes are run
 * sequentially (no parallelism), migrations within a scope are run
 * in declared order, and the ledger is persisted after each migration
 * so a crash mid-run resumes from the same point.
 */

import type { UpdateAuditLog } from '@/runtime/updates/audit-log';
import type { VersionStateStore } from '@/runtime/updates/version-state';
import type { Json } from '@/types';
import {
  type Migration,
  type MigrationContext,
  MigrationDeferred,
  type MigrationOutcome,
  type MigrationReport,
  type MigrationScope,
} from './types';

export interface RunnerOptions {
  readonly brikaDir: string;
  readonly currentVersion: string;
  readonly versionState: VersionStateStore;
  readonly audit?: UpdateAuditLog;
  /** Inject a custom logger for non-DI use cases (tests). */
  readonly log?: (
    level: 'info' | 'warn' | 'error',
    message: string,
    data?: Record<string, Json>
  ) => void;
}

export class MigrationRunner {
  readonly #scopes: readonly MigrationScope[];
  readonly #opts: RunnerOptions;

  constructor(scopes: readonly MigrationScope[], opts: RunnerOptions) {
    this.#scopes = scopes;
    this.#opts = opts;
  }

  /**
   * Run all pending migrations across all scopes. Returns one report
   * per scope. Does not throw — failures are captured in the report
   * so the caller can decide how to react (banner, fail boot, ignore).
   */
  async run(): Promise<readonly MigrationReport[]> {
    const reports: MigrationReport[] = [];
    for (const scope of this.#scopes) {
      reports.push(await this.#runScope(scope));
    }
    return reports;
  }

  async #runScope(scope: MigrationScope): Promise<MigrationReport> {
    const started = Date.now();
    const applied: string[] = [];
    const changed: string[] = [];
    const skipped: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    const previouslyApplied = new Set(this.#opts.versionState.getAppliedMigrations(scope.name));

    const ctx: MigrationContext = {
      brikaDir: this.#opts.brikaDir,
      toVersion: this.#opts.currentVersion,
      fromVersion: this.#opts.versionState.snapshot.lastBootSucceededVersion,
    };

    for (const migration of scope.migrations) {
      if (previouslyApplied.has(migration.id)) {
        skipped.push(migration.id);
        continue;
      }

      try {
        this.#log('info', `running migration ${scope.name}/${migration.id}`, {
          description: migration.description,
        });
        const outcome = await this.#runOne(migration, ctx);
        this.#opts.versionState.recordMigrationApplied(scope.name, migration.id);
        applied.push(migration.id);
        if (outcome.changed) {
          changed.push(migration.id);
          this.#log('info', `migration ${scope.name}/${migration.id} changed on-disk state`, {
            detail: outcome.detail ?? null,
          });
        }
      } catch (err) {
        if (err instanceof MigrationDeferred) {
          // Preconditions not met yet (e.g. DB doesn't exist on first
          // install). Skip *without* recording — the migration runs
          // again next boot, after the prerequisite has had a chance
          // to land. This is what keeps `prune-orphans` honest on a
          // fresh install.
          this.#log('info', `migration ${scope.name}/${migration.id} deferred`, {
            reason: err.message,
          });
          skipped.push(migration.id);
          continue;
        }
        const error = err instanceof Error ? err.message : String(err);
        this.#log('error', `migration ${scope.name}/${migration.id} failed`, { error });
        this.#opts.audit?.append('apply.failure', {
          reason: 'migration-failed',
          scope: scope.name,
          migrationId: migration.id,
          error,
        });
        failed.push({ id: migration.id, error });
        // Stop this scope on first failure — subsequent migrations may
        // depend on the failed one. Other scopes continue.
        break;
      }
    }

    const durationMs = Date.now() - started;
    if (applied.length > 0) {
      this.#opts.audit?.append('apply.success', {
        scope: scope.name,
        applied,
        changed,
        durationMs,
      });
    }
    return { scope: scope.name, applied, changed, skipped, failed, durationMs };
  }

  async #runOne(migration: Migration, ctx: MigrationContext): Promise<MigrationOutcome> {
    return await migration.run(ctx);
  }

  #log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, Json>): void {
    this.#opts.log?.(level, message, data);
  }
}
