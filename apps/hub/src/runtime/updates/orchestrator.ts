/**
 * UpdateOrchestrator — single entry point for `apply`. Owns:
 *
 *   1. Strategy selection based on detected {@link RuntimeMode}.
 *   2. Cross-process file lock so two callers can't race the swap.
 *   3. Single-flight in-memory promise so concurrent callers in the
 *      same process share one apply (with a single progress stream).
 *   4. Audit log writes around every phase transition.
 *
 * The hub HTTP layer talks to this class, not to the strategies or
 * the `applyUpdate` function directly. Tests inject a fake strategy
 * via the constructor to exercise the lock/audit behavior in
 * isolation.
 */

import { inject, singleton } from '@brika/di';
import { brikaContext } from '@/runtime/context/brika-context';
import { Logger } from '@/runtime/logs/log-router';
import type { UpdateInfo, UpdatePhase } from '@/runtime/updates/updater';
import { UpdateAuditLog } from './audit-log';
import type { UpdateChannelId } from './channels';
import { detectManagedInstall, detectRuntimeMode, type RuntimeMode } from './runtime-mode';
import { clearPreviousBackup } from './staged-install';
import { strategyForMode, UpdateRefusedError, type UpdateStrategy } from './strategies';
import { emitUpdateTelemetry } from './telemetry';
import { UpdateLock, UpdateLockHeldError } from './update-lock';
import { VersionStateStore } from './version-state';

export interface OrchestratorApplyOptions {
  force?: boolean;
  channel?: UpdateChannelId;
  pinnedVersion?: string | null;
  onProgress?: (phase: UpdatePhase, detail: string) => void;
}

export interface OrchestratorApplyResult {
  previousVersion: string;
  previousCommit: string;
  newVersion: string;
  newCommit: string;
}

@singleton()
export class UpdateOrchestrator {
  readonly #logs = inject(Logger).withSource('updates');
  #mode: RuntimeMode = detectRuntimeMode();
  #strategy: UpdateStrategy = strategyForMode(this.#mode, {
    managed: detectManagedInstall(),
  });
  #lock: UpdateLock = new UpdateLock(brikaContext.brikaDir);
  #audit: UpdateAuditLog = new UpdateAuditLog(brikaContext.brikaDir);
  #versionState: VersionStateStore = new VersionStateStore(
    brikaContext.brikaDir,
    brikaContext.version
  );

  #inflight: Promise<OrchestratorApplyResult> | null = null;
  /**
   * `true` once a successful apply has scheduled the restart-via-exit
   * dance. Subsequent `apply` calls in the (≤1 s) window before the
   * process actually exits get refused instead of starting a second
   * download that would be torn down by the imminent exit signal.
   */
  #restartPending = false;

  /**
   * Parameter-less constructor. tsyringe's `@singleton()` resolves
   * this by `new()`-ing with zero args; an `overrides?` parameter
   * would emit `Object` metadata that tsyringe can't satisfy. Tests
   * that need custom collaborators use {@link forTesting} below.
   */

  /**
   * Build an orchestrator with handpicked collaborators. Production
   * code MUST use `inject(UpdateOrchestrator)` instead — this is the
   * test seam.
   */
  static forTesting(
    overrides: Readonly<{
      mode?: RuntimeMode;
      strategy?: UpdateStrategy;
      lock?: UpdateLock;
      audit?: UpdateAuditLog;
      versionState?: VersionStateStore;
    }>
  ): UpdateOrchestrator {
    const o = new UpdateOrchestrator();
    if (overrides.mode !== undefined) {
      o.#mode = overrides.mode;
    }
    if (overrides.strategy !== undefined) {
      o.#strategy = overrides.strategy;
    } else if (overrides.mode !== undefined) {
      // Reconcile strategy with the overridden mode unless the test
      // pinned both explicitly.
      o.#strategy = strategyForMode(overrides.mode);
    }
    if (overrides.lock !== undefined) {
      o.#lock = overrides.lock;
    }
    if (overrides.audit !== undefined) {
      o.#audit = overrides.audit;
    }
    if (overrides.versionState !== undefined) {
      o.#versionState = overrides.versionState;
    }
    return o;
  }

  get mode(): RuntimeMode {
    return this.#mode;
  }

  get strategyName(): string {
    return this.#strategy.name;
  }

  /** True when the active strategy is capable of performing an in-place update. */
  canApply(): boolean {
    return this.#strategy.canApply();
  }

  /**
   * Non-blocking peek at the lock's current holder. Returns `null`
   * when the lock isn't held. Used by the HTTP layer to surface a
   * proper 423 *before* opening the SSE stream — otherwise lock
   * contention disappears into a generic 'error' progress event.
   */
  peekLockHolder(): { pid: number; startedAt: string } | null {
    return this.#lock.peekHolder();
  }

  /**
   * Call early in bootstrap. Detects a previous crashed boot (the
   * previous attempt never recorded success) and records the current
   * attempt so a future boot can do the same detection on us.
   */
  recordBootAttempt(): void {
    if (this.#versionState.previousBootCrashed()) {
      const snap = this.#versionState.snapshot;
      this.#audit.append('boot.crash-detected', {
        attemptedVersion: snap.lastBootAttemptedVersion,
        lastSucceeded: snap.lastBootSucceededVersion,
        lastAttemptedAt: snap.lastBootAttemptedAt,
      });
      this.#logs.warn('Previous boot did not complete successfully', {
        attemptedVersion: snap.lastBootAttemptedVersion,
        lastSucceeded: snap.lastBootSucceededVersion,
      });
    }
    this.#versionState.recordBootAttempt();
    this.#audit.append('boot.attempt', { version: brikaContext.version });
  }

  /**
   * Call after bootstrap completes. Closes the rollback window for
   * this version — at this point the new binary has proven it can
   * boot all the way through `onStart`, so the `brika.previous`
   * backup is no longer load-bearing.
   *
   * Doing the cleanup here (rather than in `boot-rollback.ts`) means
   * the backup stays on disk until we know the *current* boot worked,
   * not until the *previous* boot worked.
   */
  recordBootSuccess(): void {
    this.#versionState.recordBootSuccess();
    this.#audit.append('boot.success', { version: brikaContext.version });
    clearPreviousBackup(brikaContext.installDir);
  }

  check(channel: UpdateChannelId): Promise<UpdateInfo> {
    return this.#strategy.check(channel);
  }

  /**
   * Acquire the lock, run the strategy, release the lock. Concurrent
   * callers in the same process share one promise; concurrent callers
   * across processes get a {@link UpdateLockHeldError}.
   *
   * A strategy that refuses (container, system-package, dev) throws
   * {@link UpdateRefusedError} synchronously *without* the lock being
   * acquired — that's the contract the HTTP layer relies on to turn
   * a refusal into a 409 with structured guidance.
   */
  /**
   * Signal that an apply has completed successfully and the supervisor
   * restart is imminent. Called by the HTTP layer right after it
   * schedules `setTimeout(process.exit, 1000)`. The orchestrator
   * refuses any further apply attempts in that window — without this
   * flag, a second `/apply` request arriving in the 1 s gap would
   * find `#inflight === null` AND the lock released, start a fresh
   * download, then get killed by the exit signal half-way through.
   */
  markRestartPending(): void {
    this.#restartPending = true;
  }

  apply(options: OrchestratorApplyOptions): Promise<OrchestratorApplyResult> {
    if (!this.#strategy.canApply()) {
      // Force the strategy to throw its own UpdateRefusedError so the
      // refusal code + guidance reach the caller exactly as written.
      this.#audit.append('apply.refused', {
        mode: this.#mode,
        strategy: this.#strategy.name,
      });
      return this.#strategy.apply({}); // will reject
    }

    if (this.#restartPending) {
      // The successful apply has already scheduled the restart — any
      // new caller is racing the imminent exit. Refuse with a typed
      // error the route can render as "an update just succeeded,
      // wait for the hub to come back".
      this.#audit.append('apply.refused', { reason: 'restart-pending' });
      return Promise.reject(
        new UpdateLockHeldError({
          pid: process.pid,
          startedAt: 'restart-pending',
        })
      );
    }

    if (this.#inflight !== null) {
      return this.#inflight;
    }

    try {
      this.#lock.acquire();
    } catch (err) {
      if (err instanceof UpdateLockHeldError) {
        this.#audit.append('apply.refused', {
          reason: 'lock-held',
          heldBy: err.heldBy,
        });
      }
      return Promise.reject(err);
    }

    this.#audit.append('apply.start', {
      mode: this.#mode,
      strategy: this.#strategy.name,
      force: options.force ?? false,
      channel: options.channel,
    });

    const promise = this.#runApply(options).finally(() => {
      this.#inflight = null;
      this.#lock.release();
    });
    this.#inflight = promise;
    return promise;
  }

  async #runApply(options: OrchestratorApplyOptions): Promise<OrchestratorApplyResult> {
    // `performance.now()` is monotonic and immune to wall-clock jumps
    // (NTP slew, DST). Apply durations measured with `Date.now()`
    // could go negative or jump by minutes on a clock adjustment mid-run.
    const startedAt = performance.now();
    try {
      const result = await this.#strategy.apply({
        force: options.force,
        channel: options.channel,
        pinnedVersion: options.pinnedVersion,
        onProgress: (phase, detail) => {
          this.#audit.append('apply.phase', { phase, detail });
          options.onProgress?.(phase, detail);
        },
      });
      this.#audit.append('apply.success', {
        from: result.previousVersion,
        to: result.newVersion,
      });
      this.#versionState.recordUpdate({
        from: result.previousVersion,
        to: result.newVersion,
        at: new Date().toISOString(),
        status: 'ok',
      });
      // Fire-and-forget telemetry; opt-in + no-op if env not set.
      void emitUpdateTelemetry({
        fromVersion: result.previousVersion,
        toVersion: result.newVersion,
        channel: options.channel ?? 'stable',
        outcome: 'success',
        durationMs: Math.round(performance.now() - startedAt),
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const refused = err instanceof UpdateRefusedError;
      this.#audit.append(refused ? 'apply.refused' : 'apply.failure', {
        error: message,
        code: refused ? err.code : undefined,
      });
      this.#logs.error('Update apply failed', {}, { error: err });
      // Don't emit telemetry on refusal — it's not really a failure of
      // the update itself, just "this runtime can't self-apply".
      if (!refused) {
        void emitUpdateTelemetry({
          fromVersion: brikaContext.version,
          toVersion: 'unknown',
          channel: options.channel ?? 'stable',
          outcome: 'failed',
          durationMs: Math.round(performance.now() - startedAt),
          reason: message,
        });
      }
      throw err;
    }
  }
}
