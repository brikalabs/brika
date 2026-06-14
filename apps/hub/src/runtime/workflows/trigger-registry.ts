/**
 * Host-owned trigger scheduler.
 *
 * Hoists autonomous block triggers (e.g. "emit every N ms") out of the plugin
 * process and into the hub. The hub owns the timer and, when it fires, calls
 * back into the executor to emit on the trigger block's output. Because the
 * schedule lives here and not in a `setInterval` inside the plugin, a
 * trigger-only plugin no longer needs to stay resident: scale-to-zero can reap
 * it, and the trigger keeps firing from the hub.
 *
 * Interval is the only schedule kind today; the discriminated union leaves room
 * for `cron` once a parser is added, without changing the registry's shape.
 *
 * Pure scheduling: the registry never touches IPC or plugins. The timer
 * primitives are injected so it is unit-testable with a fake clock.
 */

/** A schedule the hub can drive on a plugin's behalf. */
export type TriggerSchedule = {
  readonly kind: 'interval';
  /** Fire every this-many milliseconds. Must be a positive, finite number. */
  readonly intervalMs: number;
};

/** Injected timer primitives (defaults to globals; overridden in tests). */
export interface TriggerClock {
  setInterval: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval: (handle: ReturnType<typeof setInterval>) => void;
}

const defaultClock: TriggerClock = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle),
};

export class TriggerRegistry {
  readonly #clock: TriggerClock;
  /** blockId -> its live timer handle. One trigger per block instance. */
  readonly #triggers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(clock: TriggerClock = defaultClock) {
    this.#clock = clock;
  }

  /** Number of currently-scheduled triggers (for tests / observability). */
  get size(): number {
    return this.#triggers.size;
  }

  /**
   * Schedule `fire` for a block. Re-registering the same block replaces its
   * prior schedule (so a config change re-arms cleanly). A non-positive or
   * non-finite interval is rejected without scheduling, so a misconfigured
   * trigger fails closed rather than busy-looping.
   */
  register(blockId: string, schedule: TriggerSchedule, fire: () => void): boolean {
    this.unregister(blockId);
    if (!Number.isFinite(schedule.intervalMs) || schedule.intervalMs <= 0) {
      return false;
    }
    const handle = this.#clock.setInterval(fire, schedule.intervalMs);
    // Never let a trigger timer keep the process alive on its own.
    handle.unref?.();
    this.#triggers.set(blockId, handle);
    return true;
  }

  /** Cancel a single block's trigger, if any. */
  unregister(blockId: string): void {
    const handle = this.#triggers.get(blockId);
    if (handle !== undefined) {
      this.#clock.clearInterval(handle);
      this.#triggers.delete(blockId);
    }
  }

  /** Cancel every scheduled trigger (called on workflow stop). */
  clear(): void {
    for (const handle of this.#triggers.values()) {
      this.#clock.clearInterval(handle);
    }
    this.#triggers.clear();
  }
}
