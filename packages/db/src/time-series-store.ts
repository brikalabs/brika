import { type BrikaDatabase, incrementalVacuum } from './database';

/**
 * Shared machinery for append-mostly, time-indexed stores (logs, analytics
 * events, sparks). These tables all share the same lifecycle:
 *
 *   - a batched write buffer (`enqueue` -> `setTimeout(0)` -> single
 *     transaction) so a burst of writes costs one fsync, plus a synchronous
 *     `insert` for callers/tests that want read-after-write;
 *   - graceful degradation: persistence failures are swallowed and the store
 *     disables itself after `MAX_INSERT_ERRORS` consecutive failures rather
 *     than crashing the caller (logging/analytics must never take down a request);
 *   - a periodic retention sweep that deletes rows older than a cutoff and then
 *     reclaims the freed pages with {@link incrementalVacuum};
 *   - a `close()` that drains the buffer and releases the handle, idempotently.
 *
 * Subclasses supply only the table-specific bits: which database to open, how to
 * map one event to a row, and the delete-older-than query. Read APIs
 * (query/aggregate/distinct) stay on the subclass since they vary per table.
 */
const MAX_INSERT_ERRORS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export abstract class TimeSeriesStore<TEvent, TSchema extends Record<string, unknown>> {
  #database: BrikaDatabase<TSchema> | null = null;
  #insertDisabled = false;
  #insertErrors = 0;
  // Hard stop: after close(), enqueue/flush become no-ops so a shutdown /
  // hot-reload race can't pile events into a buffer that will never drain.
  #closed = false;
  #pruneTimer?: ReturnType<typeof setInterval>;
  readonly #queue: TEvent[] = [];
  #flushTimer?: ReturnType<typeof setTimeout>;

  /** Open the backing database (e.g. `logsDb.open()`). */
  protected abstract openDatabase(): BrikaDatabase<TSchema>;
  /** Insert one event into the concrete table (uses {@link db}). */
  protected abstract writeRow(event: TEvent): void;
  /** Delete rows older than `cutoff`, returning how many were removed. */
  protected abstract deleteOlderThan(cutoff: number): number;

  init(): void {
    this.#database = this.openDatabase();
    this.#closed = false;
  }

  /** The drizzle handle for subclass read/write queries, or null before init / after close. */
  protected get db(): BrikaDatabase<TSchema>['db'] | null {
    return this.#database?.db ?? null;
  }

  #writable(): boolean {
    return !this.#closed && this.#database !== null && !this.#insertDisabled;
  }

  /**
   * Start a periodic sweep dropping rows older than `retentionDays`, freed pages
   * reclaimed after each sweep. `retentionDays = 0` (or `intervalMs = 0`)
   * disables it. Idempotent: a second call replaces the timer. Runs once
   * immediately so a stale DB shrinks at boot instead of after a full interval.
   */
  startRetention(retentionDays: number, intervalMs: number): void {
    this.stopRetention();
    if (retentionDays <= 0 || intervalMs <= 0) {
      return;
    }
    const sweep = () => {
      this.pruneOlderThan(Date.now() - retentionDays * DAY_MS);
    };
    sweep();
    this.#pruneTimer = setInterval(sweep, intervalMs);
  }

  stopRetention(): void {
    if (this.#pruneTimer) {
      clearInterval(this.#pruneTimer);
      this.#pruneTimer = undefined;
    }
  }

  /**
   * Delete all rows with `ts < cutoff`, returning the count removed, then
   * reclaim the freed pages. Failures are swallowed so a transient I/O error
   * never crashes the retention timer.
   */
  pruneOlderThan(cutoff: number): number {
    if (!this.#database) {
      return 0;
    }
    let removed = 0;
    try {
      removed = this.deleteOlderThan(cutoff);
    } catch {
      return 0;
    }
    if (removed > 0) {
      try {
        incrementalVacuum(this.#database.sqlite);
      } catch {
        // Best-effort: a failed reclaim leaves the freed pages for next time.
      }
    }
    return removed;
  }

  /**
   * Buffer an event for batched persistence. The actual SQLite write defers to
   * the next tick (or to {@link flush}/{@link close}), so a synchronous burst
   * collapses into one transaction. `setTimeout(0)` (not a microtask) lets the
   * whole call stack finish enqueuing before the flush runs.
   */
  enqueue(event: TEvent): void {
    if (!this.#writable()) {
      return;
    }
    this.#queue.push(event);
    if (!this.#flushTimer) {
      this.#flushTimer = setTimeout(() => this.flush(), 0);
    }
  }

  /** Drain the write buffer into SQLite in a single transaction. Idempotent when empty. */
  flush(): void {
    if (this.#flushTimer) {
      clearTimeout(this.#flushTimer);
      this.#flushTimer = undefined;
    }
    if (this.#queue.length === 0) {
      return;
    }
    const batch = this.#queue.splice(0, this.#queue.length);
    if (!this.#writable() || !this.#database) {
      return;
    }
    try {
      this.#database.sqlite.transaction(() => {
        for (const event of batch) {
          this.writeRow(event);
        }
      })();
      this.#insertErrors = 0;
    } catch {
      this.#recordInsertError();
    }
  }

  /**
   * Synchronous single-row insert with read-after-write semantics. For callers
   * (and tests) that need the row visible immediately; the batched hot path
   * uses {@link enqueue}.
   */
  insert(event: TEvent): void {
    if (!this.#writable()) {
      return;
    }
    try {
      this.writeRow(event);
      this.#insertErrors = 0;
    } catch {
      this.#recordInsertError();
    }
  }

  #recordInsertError(): void {
    // Tolerate transient I/O errors; only give up after repeated failures.
    this.#insertErrors += 1;
    if (this.#insertErrors >= MAX_INSERT_ERRORS) {
      this.#insertDisabled = true;
    }
  }

  /**
   * Drain the buffer and close the handle. Idempotent: the graceful-shutdown
   * path may call this on the clean stop and again from the hard-timeout
   * fallback, so a second call is a harmless no-op.
   */
  close(): void {
    this.stopRetention();
    this.flush();
    this.#closed = true;
    this.#queue.length = 0;
    if (this.#flushTimer) {
      clearTimeout(this.#flushTimer);
      this.#flushTimer = undefined;
    }
    if (this.#database) {
      this.#database.sqlite.close();
      this.#database = null;
    }
  }
}
