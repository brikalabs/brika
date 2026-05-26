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
import type { UpdateInfo, UpdatePhase } from '@/updater';
import { UpdateAuditLog } from './audit-log';
import type { UpdateChannelId } from './channels';
import { detectRuntimeMode, type RuntimeMode } from './runtime-mode';
import { strategyForMode, UpdateRefusedError, type UpdateStrategy } from './strategies';
import { UpdateLock, UpdateLockHeldError } from './update-lock';
import { VersionStateStore } from './version-state';

export interface OrchestratorApplyOptions {
  force?: boolean;
  channel?: UpdateChannelId;
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
  readonly #mode: RuntimeMode;
  readonly #strategy: UpdateStrategy;
  readonly #lock: UpdateLock;
  readonly #audit: UpdateAuditLog;
  readonly #versionState: VersionStateStore;

  #inflight: Promise<OrchestratorApplyResult> | null = null;

  constructor(
    overrides?: Readonly<{
      mode?: RuntimeMode;
      strategy?: UpdateStrategy;
      lock?: UpdateLock;
      audit?: UpdateAuditLog;
      versionState?: VersionStateStore;
    }>
  ) {
    this.#mode = overrides?.mode ?? detectRuntimeMode();
    this.#strategy = overrides?.strategy ?? strategyForMode(this.#mode);
    this.#lock = overrides?.lock ?? new UpdateLock(brikaContext.brikaDir);
    this.#audit = overrides?.audit ?? new UpdateAuditLog(brikaContext.brikaDir);
    this.#versionState =
      overrides?.versionState ?? new VersionStateStore(brikaContext.brikaDir, brikaContext.version);
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

  /** Call after bootstrap completes. Closes the rollback window for this version. */
  recordBootSuccess(): void {
    this.#versionState.recordBootSuccess();
    this.#audit.append('boot.success', { version: brikaContext.version });
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
    try {
      const result = await this.#strategy.apply({
        force: options.force,
        channel: options.channel,
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
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const refused = err instanceof UpdateRefusedError;
      this.#audit.append(refused ? 'apply.refused' : 'apply.failure', {
        error: message,
        code: refused ? err.code : undefined,
      });
      this.#logs.error('Update apply failed', {}, { error: err });
      throw err;
    }
  }
}
