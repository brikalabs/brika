/**
 * Version state — small JSON file at `${brikaDir}/.version-state.json`
 * that tracks which Brika version last ran successfully, what's
 * pending, and a tail of recent updates. Used by the orchestrator to
 * detect a crashed-on-boot situation and roll the binary back.
 *
 * Why not store this in `state.db`? Chicken-and-egg: the DB itself
 * needs to be migrated when the schema version changes, and migrations
 * need to know "what version wrote this on-disk state". A plain JSON
 * file is readable before any database is opened, can survive a DB
 * corruption event, and is trivial to inspect with `cat`.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { Json } from '@/types';

/** Optional structured-warning sink, injected so this pre-DI utility can report a corrupt state file. */
export type VersionStateLog = (message: string, meta?: Record<string, Json>) => void;

const UpdateHistoryEntry = z.object({
  from: z.string(),
  to: z.string(),
  at: z.string(),
  status: z.enum(['ok', 'rolled-back', 'self-check-failed', 'apply-failed']),
  reason: z.string().optional(),
});
export type UpdateHistoryEntry = z.infer<typeof UpdateHistoryEntry>;

const VersionStateSchema = z.object({
  schemaVersion: z.literal(1),
  lastSeenVersion: z.string(),
  lastBootSucceededVersion: z.string().nullable(),
  lastBootAttemptedAt: z.string().nullable(),
  lastBootAttemptedVersion: z.string().nullable(),
  updateHistory: z.array(UpdateHistoryEntry),
  /**
   * Per-scope migration ledger. The key is the scope name
   * (`plugin-data`, `secrets`, …); the value is the ordered list of
   * migration IDs already applied. `MigrationRunner` consults + appends.
   * Default `{}` for backwards compat with pre-Phase-2 state files.
   */
  scopes: z.record(z.string(), z.array(z.string())).default({}),
});
export type VersionState = z.infer<typeof VersionStateSchema>;

/**
 * Lenient view of just the migration ledger. Used to salvage `scopes` when the full file fails schema
 * validation (e.g. a future `schemaVersion` bump, or a corrupt boot-tracking field), so the
 * load-bearing migration record survives instead of being silently wiped and re-applied.
 */
const LedgerSchema = z.object({
  scopes: z.record(z.string(), z.array(z.string())).optional(),
});

const STATE_FILE = '.version-state.json';
const HISTORY_MAX = 50;

function emptyState(currentVersion: string): VersionState {
  return {
    schemaVersion: 1,
    lastSeenVersion: currentVersion,
    lastBootSucceededVersion: null,
    lastBootAttemptedAt: null,
    lastBootAttemptedVersion: null,
    updateHistory: [],
    scopes: {},
  };
}

/**
 * Synchronous, atomic reader/writer for the version-state file.
 *
 * Atomicity: writes go to `${file}.tmp` then `rename()` over the
 * target. `rename` is atomic on POSIX and on NTFS for the same volume,
 * so a power loss never leaves a half-written file.
 */
export class VersionStateStore {
  readonly #path: string;
  readonly #currentVersion: string;
  readonly #log?: VersionStateLog;
  #state: VersionState;

  constructor(brikaDir: string, currentVersion: string, log?: VersionStateLog) {
    this.#path = join(brikaDir, STATE_FILE);
    this.#currentVersion = currentVersion;
    this.#log = log;
    this.#state = this.#load();
  }

  /** Snapshot of the on-disk state. Mutating the returned object has no effect — call setters. */
  get snapshot(): Readonly<VersionState> {
    return this.#state;
  }

  /**
   * Call before any bootstrap work. Records "we're attempting to boot
   * version X". If the next boot reads this file and sees
   * `lastBootAttemptedVersion !== lastBootSucceededVersion`, the
   * previous boot must have crashed — the orchestrator uses that to
   * trigger a rollback.
   */
  recordBootAttempt(): void {
    this.#mutate((s) => ({
      ...s,
      lastBootAttemptedAt: new Date().toISOString(),
      lastBootAttemptedVersion: this.#currentVersion,
    }));
  }

  /**
   * Call after `onStart` completes. Closes the rollback window: this
   * version is now considered "stuck" and a future binary swap can
   * delete the `brika.previous` backup.
   */
  recordBootSuccess(): void {
    this.#mutate((s) => ({
      ...s,
      lastBootSucceededVersion: this.#currentVersion,
      lastSeenVersion: this.#currentVersion,
    }));
  }

  /** Append one entry to the rolling update history (capped at HISTORY_MAX). */
  recordUpdate(entry: UpdateHistoryEntry): void {
    this.#mutate((s) => ({
      ...s,
      updateHistory: [...s.updateHistory, entry].slice(-HISTORY_MAX),
    }));
  }

  /** Migration IDs already applied for the given scope. */
  getAppliedMigrations(scope: string): readonly string[] {
    return this.#state.scopes[scope] ?? [];
  }

  /**
   * Append a migration ID to the scope's applied list. Idempotent —
   * re-applying the same ID is a no-op.
   */
  recordMigrationApplied(scope: string, migrationId: string): void {
    this.#mutate((s) => {
      const current = s.scopes[scope] ?? [];
      if (current.includes(migrationId)) {
        return s;
      }
      return {
        ...s,
        scopes: { ...s.scopes, [scope]: [...current, migrationId] },
      };
    });
  }

  /**
   * `true` when the previous boot recorded an attempt that never made
   * it to `recordBootSuccess()` — typically a crash during `onStart`.
   */
  previousBootCrashed(): boolean {
    const s = this.#state;
    if (s.lastBootAttemptedVersion === null) {
      return false;
    }
    return s.lastBootAttemptedVersion !== s.lastBootSucceededVersion;
  }

  #load(): VersionState {
    if (!existsSync(this.#path)) {
      return emptyState(this.#currentVersion); // first install: expected, not a warning
    }

    let json: unknown;
    try {
      json = JSON.parse(readFileSync(this.#path, 'utf8'));
    } catch (error) {
      // Unreadable file or non-JSON bytes: nothing to salvage. Warn rather than silently reset, since a
      // reset re-applies every migration on the next boot.
      this.#log?.('version-state file unreadable or not valid JSON; starting from empty state', {
        path: this.#path,
        error: String(error),
      });
      return emptyState(this.#currentVersion);
    }

    const parsed = VersionStateSchema.safeParse(json);
    if (parsed.success) {
      return parsed.data;
    }

    // Partial corruption / schema drift (e.g. a future `schemaVersion` bump, or a single bad field):
    // do NOT discard the migration ledger. Wiping it is what silently re-applies every migration and
    // re-fires the "state updated" banner. Salvage `scopes` leniently; reset only the boot-tracking
    // fields, which are recomputed on the next boot anyway.
    const recovered = emptyState(this.#currentVersion);
    const ledger = LedgerSchema.safeParse(json);
    if (ledger.success && ledger.data.scopes) {
      recovered.scopes = ledger.data.scopes;
    }
    this.#log?.('version-state failed validation; preserved the migration ledger, reset the rest', {
      path: this.#path,
      preservedScopes: Object.keys(recovered.scopes),
      issues: parsed.error.issues.map((i) => i.path.join('.') || '(root)').slice(0, 10),
    });
    return recovered;
  }

  /**
   * Apply a mutation and persist atomically. **Always reads from disk
   * first** so that independent `VersionStateStore` instances pointing
   * at the same brikaDir (orchestrator, boot-rollback, migrations
   * plugin each construct their own) don't clobber each other's
   * writes by holding stale `#state` snapshots in memory.
   *
   * The cost is one extra `readFileSync` per mutation — mutations are
   * rare (boot start/end, occasional update history append, migration
   * ledger update) so the latency is irrelevant. The correctness win
   * is preventing silent migration-ledger loss on every restart.
   */
  #mutate(fn: (s: VersionState) => VersionState): void {
    this.#state = this.#load();
    this.#state = fn(this.#state);
    this.#persist();
  }

  #persist(): void {
    mkdirSync(dirname(this.#path), { recursive: true });
    const tmp = `${this.#path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.#state, null, 2), { encoding: 'utf8', mode: 0o600 });
    renameSync(tmp, this.#path);
  }
}
