/**
 * Migration framework — unified runner for *non-DB* on-disk state
 * (plugin-data dirs, secrets layout, config files). Schema-level
 * migrations for `state.db` are still handled by `@brika/db`'s SQL
 * migration loader; this runner is intentionally code-level so it
 * can re-layout filesystem state, rewrite YAML configs, or rotate
 * encryption keys — things SQL can't express.
 *
 * Each scope is a namespace with its own ordered list of migrations.
 * The `VersionStateStore.scopes` ledger records which migration IDs
 * have been applied per scope; the runner skips already-applied ones,
 * runs the rest in order, and persists the ledger after each success.
 *
 * Failure semantics: if a migration throws, the runner stops that
 * scope but continues with the next scope. The unapplied migration
 * stays unapplied — retried on next boot. Migrations MUST be
 * idempotent and order-independent within their scope so a partial
 * run can resume cleanly.
 */

export interface MigrationContext {
  /** Per-install data dir; `${brikaContext.brikaDir}`. */
  readonly brikaDir: string;
  /** The version we're transitioning *to* (the current build). */
  readonly toVersion: string;
  /**
   * The last version that successfully booted, or `null` on first
   * install / when the previous version predates the ledger. Used by
   * migrations that want to skip work on fresh installs.
   */
  readonly fromVersion: string | null;
}

/**
 * What a migration actually did. The runner records every successful migration in the ledger (so it is
 * skipped forever after), but only a migration that reports `changed: true` is surfaced to the operator.
 * A no-op (nothing to migrate on a fresh install, or an intentional ledger stamp) returns
 * `changed: false` so the UI never announces work that did not happen.
 */
export interface MigrationOutcome {
  readonly changed: boolean;
  /** Optional human detail for the audit log (e.g. "pruned 3 orphan dirs"). */
  readonly detail?: string;
}

export interface Migration {
  /**
   * Stable identifier — never renamed, never reused. The ledger is
   * keyed on this. Convention: `NNNN-kebab-case-name`, sortable.
   */
  readonly id: string;
  /** Brief description for the audit log. */
  readonly description: string;
  /**
   * Apply the migration. Must be idempotent — the runner skips
   * applied IDs, but the migration itself might run twice if the
   * ledger write races with a crash. Return a {@link MigrationOutcome}
   * stating whether it actually changed on-disk state; a no-op must
   * return `changed: false` so it is recorded but never announced.
   *
   * Throw {@link MigrationDeferred} to signal "preconditions not met
   * yet, retry on next boot". The runner treats it as a no-op (not a
   * failure) and does **not** mark the migration applied, so the
   * migration runs again next boot when preconditions are likely met.
   */
  run(ctx: MigrationContext): Promise<MigrationOutcome>;
}

/**
 * Sentinel thrown from `Migration.run` when the migration can't do
 * its work right now but isn't actually broken — e.g. the DB it would
 * inspect doesn't exist yet on a fresh install. The runner catches
 * this, logs it, and skips marking the migration applied so a later
 * boot retries.
 */
export class MigrationDeferred extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'MigrationDeferred';
  }
}

export interface MigrationScope {
  /** Stable name — used as the ledger key. */
  readonly name: string;
  /** Migrations in apply order. Append new ones to the end. */
  readonly migrations: readonly Migration[];
}

export interface MigrationReport {
  readonly scope: string;
  /** Migrations that ran successfully and were recorded in the ledger (includes no-ops). */
  readonly applied: readonly string[];
  /** The subset of `applied` that actually changed on-disk state, i.e. worth surfacing to the operator. */
  readonly changed: readonly string[];
  readonly skipped: readonly string[];
  readonly failed: ReadonlyArray<{ id: string; error: string }>;
  readonly durationMs: number;
}
