/**
 * RestartPolicy - Smart crash loop protection with exponential backoff
 *
 * Provides automatic restart with:
 * - Exponential backoff: delays double after each crash (1s → 2s → 4s → ...)
 * - Crash loop detection: stops restarts if too many crashes in a time window
 * - Auto-reset: if process runs stable long enough, backoff resets
 */

export interface RestartPolicyConfig {
  /** Initial delay before first restart (ms) */
  baseDelayMs: number;
  /** Maximum delay between restarts (ms) */
  maxDelayMs: number;
  /** Max crashes allowed in the time window before giving up */
  maxCrashes: number;
  /** Time window for counting crashes (ms) */
  crashWindowMs: number;
  /** How long process must run before we consider it stable and reset backoff (ms) */
  stabilityThresholdMs: number;
}

export interface RestartState {
  /** Timestamps of recent crashes (within the window) */
  crashTimestamps: number[];
  /** Current backoff multiplier (0 = base delay, 1 = 2x, 2 = 4x, ...) */
  backoffLevel: number;
  /** When the last restart attempt was made */
  lastRestartAt: number | null;
  /** When the process was last started */
  lastStartAt: number | null;
  /** Scheduled restart timer */
  pendingTimer: Timer | null;
}

export type RestartDecision =
  | { action: "restart"; delayMs: number }
  | { action: "crash-loop"; reason: string };

const DEFAULT_CONFIG: RestartPolicyConfig = {
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  maxCrashes: 5,
  crashWindowMs: 60000,
  stabilityThresholdMs: 30000,
};

export class RestartPolicy {
  readonly config: RestartPolicyConfig;
  readonly #states = new Map<string, RestartState>();

  constructor(config: Partial<RestartPolicyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record a crash and get the restart decision
   */
  onCrash(id: string): RestartDecision {
    const now = Date.now();
    const state = this.#getOrCreateState(id);

    // Clear any pending restart
    if (state.pendingTimer) {
      clearTimeout(state.pendingTimer);
      state.pendingTimer = null;
    }

    // Add this crash and prune old ones outside the window
    state.crashTimestamps.push(now);
    state.crashTimestamps = state.crashTimestamps.filter((ts) => now - ts < this.config.crashWindowMs);

    // Check for crash loop
    if (state.crashTimestamps.length >= this.config.maxCrashes) {
      return {
        action: "crash-loop",
        reason: `${state.crashTimestamps.length} crashes in ${Math.round(this.config.crashWindowMs / 1000)}s`,
      };
    }

    // Calculate backoff delay
    const delayMs = Math.min(this.config.baseDelayMs * 2 ** state.backoffLevel, this.config.maxDelayMs);

    // Increase backoff for next time
    state.backoffLevel++;

    return { action: "restart", delayMs };
  }

  /**
   * Record a successful start - begins stability tracking
   */
  onStart(id: string): void {
    const state = this.#getOrCreateState(id);
    state.lastStartAt = Date.now();
    state.lastRestartAt = Date.now();
  }

  /**
   * Check if process has been stable long enough to reset backoff
   * Call this periodically or before checking restart eligibility
   */
  checkStability(id: string): boolean {
    const state = this.#states.get(id);
    if (!state?.lastStartAt) return false;

    const runTime = Date.now() - state.lastStartAt;
    if (runTime >= this.config.stabilityThresholdMs) {
      // Process is stable, reset backoff
      state.backoffLevel = 0;
      state.crashTimestamps = [];
      return true;
    }
    return false;
  }

  /**
   * Schedule a restart with the given delay
   */
  scheduleRestart(id: string, delayMs: number, callback: () => void): void {
    const state = this.#getOrCreateState(id);

    // Clear any existing timer
    if (state.pendingTimer) {
      clearTimeout(state.pendingTimer);
    }

    state.pendingTimer = setTimeout(() => {
      state.pendingTimer = null;
      callback();
    }, delayMs);
  }

  /**
   * Cancel any pending restart
   */
  cancelPending(id: string): void {
    const state = this.#states.get(id);
    if (state?.pendingTimer) {
      clearTimeout(state.pendingTimer);
      state.pendingTimer = null;
    }
  }

  /**
   * Reset all state for an id (e.g., on manual restart or disable)
   */
  reset(id: string): void {
    this.cancelPending(id);
    this.#states.delete(id);
  }

  /**
   * Get current state for debugging/UI
   */
  getState(id: string): Readonly<RestartState> | undefined {
    return this.#states.get(id);
  }

  #getOrCreateState(id: string): RestartState {
    let state = this.#states.get(id);
    if (!state) {
      state = {
        crashTimestamps: [],
        backoffLevel: 0,
        lastRestartAt: null,
        lastStartAt: null,
        pendingTimer: null,
      };
      this.#states.set(id, state);
    }
    return state;
  }
}
