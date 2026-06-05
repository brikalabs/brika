/**
 * Update strategy contract.
 *
 * Each {@link RuntimeMode} maps to a concrete strategy that knows how
 * to (or refuses to) apply an update in that environment:
 *
 *   - `standalone`     → download + verify + staged install + restart
 *   - `supervised`     → same as standalone, but lets the supervisor
 *                        do the rename + restart so we don't fight it
 *   - `container`      → refuses; surfaces "pull a new image" guidance
 *   - `system-package` → refuses; surfaces "use your package manager"
 *   - `dev`            → refuses; surfaces "you're running from source"
 *
 * The orchestrator selects the strategy at startup and dispatches
 * `check()` / `apply()` through it. Adding a new deployment shape
 * (e.g. flatpak, snap) is one new file + one switch arm in the
 * orchestrator factory.
 */

import type { UpdateChannelId } from '../channels';
import type { UpdateInfo, UpdatePhase } from '../updater';

/** Reasons a strategy may refuse to apply. Surfaced to the client as the `code`. */
export type RefusalCode =
  | 'UPDATE_NOT_APPLICABLE'
  /** Running from source — there's no binary to replace. */
  | 'UPDATE_DEV_MODE'
  /** Inside a container — operator must pull a new image. */
  | 'UPDATE_CONTAINER'
  /** Installed via a system package manager — let it own the binary. */
  | 'UPDATE_SYSTEM_PACKAGE';

export class UpdateRefusedError extends Error {
  readonly code: RefusalCode;
  readonly guidance: string;

  constructor(code: RefusalCode, guidance: string) {
    super(guidance);
    this.name = 'UpdateRefusedError';
    this.code = code;
    this.guidance = guidance;
  }
}

export interface StrategyApplyOptions {
  force?: boolean;
  channel?: UpdateChannelId;
  pinnedVersion?: string | null;
  onProgress?: (phase: UpdatePhase, detail: string) => void;
}

export interface StrategyApplyResult {
  previousVersion: string;
  previousCommit: string;
  newVersion: string;
  newCommit: string;
}

export interface UpdateStrategy {
  /** Human-readable name for logs/telemetry, e.g. `"standalone"`. */
  readonly name: string;

  /** Cheap check the orchestrator runs before `apply()` to short-circuit refused strategies. */
  canApply(): boolean;

  /**
   * Check upstream for a newer release. All strategies implement this
   * so the UI can show update *availability* even when the runtime
   * refuses to self-apply (Docker still wants the "new image available" badge).
   */
  check(channel: UpdateChannelId): Promise<UpdateInfo>;

  /**
   * Apply the update. Refused strategies throw {@link UpdateRefusedError}
   * synchronously so the orchestrator can convert it to a 409 with
   * structured guidance without taking the lock.
   */
  apply(options: StrategyApplyOptions): Promise<StrategyApplyResult>;
}
