/**
 * Scale-to-zero plugin reaper.
 *
 * Periodically reaps plugin processes that have gone idle, freeing their
 * runtime so a hub with many installed plugins does not pay a resident Bun
 * process for every one. A reaped plugin stays *enabled* in state and is
 * respawned on demand (see `PluginLifecycle.ensureStarted`); reaping is not
 * disabling.
 *
 * Safety gates, all of which must pass before a plugin is reaped:
 *  - its idle window has elapsed (no work or output for `idleReapMs`);
 *  - it has no in-flight request/response call (never killed mid-route);
 *  - no reap guard pins it (e.g. an executor that owns one of its blocks, or
 *    a live in-plugin trigger that would stop firing if the process died);
 *  - it is not among the `keepWarmCount` most-recently-active plugins, which
 *    stay resident to hide cold-start latency on the hot set.
 *
 * The reaper is pure scheduling + policy: it never touches IPC or processes
 * directly, only the injected `listProcesses`/`reap` seam, which keeps it
 * unit-testable with a fake clock.
 */

/** The slice of a plugin process the reaper needs to make a decision. */
export interface ReapableProcess {
  readonly name: string;
  /** Last time the plugin did real work or produced output (epoch ms). */
  readonly lastActivityAt: number;
  /** True while a request/response call is awaiting a reply. */
  readonly hasInFlight: boolean;
}

/** Returns true when `name` must stay resident (pinned). */
export type ReapGuard = (name: string) => boolean;

export interface PluginReaperOptions {
  /** Idle window before a plugin is eligible for reaping. `<= 0` disables. */
  readonly idleReapMs: number;
  /** Keep the N most-recently-active plugins resident regardless of idleness. */
  readonly keepWarmCount: number;
  /** How often the sweep runs. */
  readonly sweepIntervalMs: number;
  /** Clock seam (epoch ms); injectable for tests. */
  readonly now: () => number;
  /** Snapshot of the currently-running plugin processes. */
  readonly listProcesses: () => ReapableProcess[];
  /** Reap one plugin by name (idempotent; the lifecycle serializes it). */
  readonly reap: (name: string) => void;
}

export class PluginReaper {
  #timer: ReturnType<typeof setInterval> | undefined;
  readonly #guards = new Set<ReapGuard>();

  constructor(private readonly options: PluginReaperOptions) {}

  /** True when reaping is configured on (a positive idle window). */
  get enabled(): boolean {
    return this.options.idleReapMs > 0;
  }

  /**
   * Register a predicate that pins plugins (returns true => keep resident).
   * Returns a disposer. Guards compose: a plugin is pinned if ANY guard pins it.
   */
  addGuard(guard: ReapGuard): () => void {
    this.#guards.add(guard);
    return () => {
      this.#guards.delete(guard);
    };
  }

  /** Start the periodic sweep. No-op when disabled or already running. */
  start(): void {
    if (!this.enabled || this.#timer) {
      return;
    }
    this.#timer = setInterval(() => this.sweep(), this.options.sweepIntervalMs);
    // Never let the reaper keep the process alive on its own.
    this.#timer.unref?.();
  }

  /** Stop the periodic sweep. */
  stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
  }

  #isPinned(name: string): boolean {
    for (const guard of this.#guards) {
      if (guard(name)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Names eligible to reap right now: idle beyond the window, no in-flight
   * call, not pinned by a guard, and not in the keep-warm set. Pure (no side
   * effects) so tests and the sweep share one decision path.
   */
  reapable(): string[] {
    if (!this.enabled) {
      return [];
    }
    const now = this.options.now();
    const processes = this.options.listProcesses();
    const warm = this.#keepWarmNames(processes);

    const out: string[] = [];
    for (const p of processes) {
      if (p.hasInFlight) {
        continue;
      }
      if (now - p.lastActivityAt < this.options.idleReapMs) {
        continue;
      }
      if (warm.has(p.name)) {
        continue;
      }
      if (this.#isPinned(p.name)) {
        continue;
      }
      out.push(p.name);
    }
    return out;
  }

  /** Run one sweep, reaping every currently-eligible plugin. */
  sweep(): void {
    for (const name of this.reapable()) {
      this.options.reap(name);
    }
  }

  /** The `keepWarmCount` most-recently-active plugin names. */
  #keepWarmNames(processes: ReapableProcess[]): Set<string> {
    const n = this.options.keepWarmCount;
    if (n <= 0) {
      return new Set();
    }
    // When the warm count covers every running plugin, all are warm.
    if (processes.length <= n) {
      return new Set(processes.map((p) => p.name));
    }
    const hottest = [...processes].sort((a, b) => b.lastActivityAt - a.lastActivityAt).slice(0, n);
    return new Set(hottest.map((p) => p.name));
  }
}
