import {
  and, asc, type BrikaDatabase, count, cursorFilter, desc, endTsFilter,
  eq, isNotNull, lt, oneOrMany, sql, startTsFilter,
} from "@brika/db";
import { singleton } from "@brika/di";
import type { Json } from "@/types";
import { logsDb } from "./database";
import { logs as logsTable } from "./schema";
import type { LogEvent, LogLevel, LogSource } from "./types";

/**
 * Escape SQLite LIKE wildcards (`%`, `_`) and the escape char itself so a
 * search term is matched literally. Pair with `ESCAPE '\\'` in the query.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LogQueryParams {
  level?: LogLevel | LogLevel[];
  source?: LogSource | LogSource[];
  pluginName?: string;
  search?: string;
  startTs?: number;
  endTs?: number;
  cursor?: number;
  limit?: number;
  order?: "asc" | "desc";
}

export interface LogQueryResult {
  logs: StoredLogEvent[];
  nextCursor: number | null;
}

export interface StoredLogEvent extends LogEvent {
  id: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Log Store Service
// ─────────────────────────────────────────────────────────────────────────────

const MAX_INSERT_ERRORS = 5;

@singleton()
export class LogStore {
  #database: BrikaDatabase<{ logs: typeof logsTable }> | null = null;
  #insertDisabled = false;
  #insertErrors = 0;
  #pruneTimer?: Timer;

  // Write buffer for the batched hot path. Logger.emit() funnels every event
  // through enqueue() so a burst of log lines collapses into a single
  // transaction on the next tick instead of one synchronous fsync per line.
  readonly #queue: LogEvent[] = [];
  #flushTimer?: Timer;

  init(): void {
    this.#database = logsDb.open();
  }

  /**
   * Start a periodic background sweep that drops rows older than
   * `retentionDays`. Safe to call once at boot; idempotent (a second
   * call replaces the previous timer). Call `stopRetention()` on
   * shutdown to clear it.
   *
   * `retentionDays = 0` disables the sweep entirely (logs grow
   * unbounded). The sweep is `DELETE WHERE ts < cutoff` against the
   * `idx_logs_ts` index — fast even for million-row tables.
   */
  startRetention(retentionDays: number, intervalMs: number): void {
    this.stopRetention();
    if (retentionDays <= 0 || intervalMs <= 0) {
      return;
    }
    const sweep = () => {
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      this.pruneOlderThan(cutoff);
    };
    // Run once at startup so a stale DB shrinks immediately rather than
    // waiting a full interval; subsequent sweeps fire every intervalMs.
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
   * Delete all log rows with `ts < cutoff`. Returns the number of rows
   * removed. Failures are swallowed so a transient I/O error never
   * crashes the timer that calls us.
   */
  pruneOlderThan(cutoff: number): number {
    if (!this.db) { return 0; }
    try {
      const deleted = this.db
        .delete(logsTable)
        .where(lt(logsTable.ts, cutoff))
        .returning({ id: logsTable.id })
        .all();
      return deleted.length;
    } catch {
      return 0;
    }
  }

  private get db() {
    return this.#database?.db ?? null;
  }

  /**
   * Buffer an event for batched persistence. This is the hot path used by
   * {@link Logger.emit}: the actual SQLite write is deferred to the next tick
   * (or to {@link flush}/{@link close}), so a burst of synchronous log calls
   * costs one transaction instead of N synchronous fsyncs. Events are never
   * lost on a clean exit because {@link close} drains the buffer; on a crash
   * the {@link crashHandlers} plugin calls close() which flushes too.
   */
  enqueue(event: LogEvent): void {
    if (!this.db || this.#insertDisabled) { return; }
    this.#queue.push(event);
    if (!this.#flushTimer) {
      // setTimeout(0) (not a microtask) so the whole synchronous call stack —
      // which may emit many log lines — finishes enqueuing before we flush.
      this.#flushTimer = setTimeout(() => this.flush(), 0);
    }
  }

  /**
   * Drain the write buffer into SQLite in a single transaction. Safe to call
   * at any time (idempotent when the buffer is empty); invoked by the flush
   * timer, on {@link close}, and on crash. Failures are swallowed for the
   * same reason {@link insert} swallows them — log persistence must never
   * crash the request pipeline.
   */
  flush(): void {
    if (this.#flushTimer) {
      clearTimeout(this.#flushTimer);
      this.#flushTimer = undefined;
    }
    if (this.#queue.length === 0) { return; }

    const batch = this.#queue.splice(0, this.#queue.length);
    if (!this.db || this.#insertDisabled) { return; }

    try {
      this.#database?.sqlite.transaction(() => {
        for (const event of batch) {
          this.#insertRow(event);
        }
      })();
      this.#insertErrors = 0;
    } catch {
      this.#insertErrors++;
      if (this.#insertErrors >= MAX_INSERT_ERRORS) {
        this.#insertDisabled = true;
      }
    }
  }

  /**
   * Synchronous single-row insert with immediate read-after-write semantics.
   * Kept for direct callers and tests; the logging hot path uses
   * {@link enqueue} instead.
   */
  insert(event: LogEvent): void {
    if (!this.db || this.#insertDisabled) { return; }

    try {
      this.#insertRow(event);
      this.#insertErrors = 0;
    } catch {
      // Silently drop — log persistence must never crash the request pipeline.
      // Only disable after repeated failures to tolerate transient I/O errors.
      this.#insertErrors++;
      if (this.#insertErrors >= MAX_INSERT_ERRORS) {
        this.#insertDisabled = true;
      }
    }
  }

  #insertRow(event: LogEvent): void {
    this.db?.insert(logsTable).values({
      ts: event.ts,
      level: event.level,
      source: event.source,
      pluginName: event.pluginName ?? null,
      message: event.message,
      meta: event.meta ? JSON.stringify(event.meta) : null,
      errorName: event.error?.name ?? null,
      errorMessage: event.error?.message ?? null,
      errorStack: event.error?.stack ?? null,
      errorCause: event.error?.cause ?? null,
    }).run();
  }

  query(params: LogQueryParams = {}): LogQueryResult {
    if (!this.db) { return { logs: [], nextCursor: null }; }

    const { level, source, pluginName, search, startTs, endTs, cursor } = params;
    const limit = Math.min(params.limit ?? 100, 1000);
    const order = params.order ?? "desc";
    const likePattern = search ? `%${escapeLike(search)}%` : undefined;

    const rows = this.db
      .select()
      .from(logsTable)
      .where(and(
        oneOrMany(logsTable.level, level),
        oneOrMany(logsTable.source, source),
        pluginName ? eq(logsTable.pluginName, pluginName) : undefined,
        search
          ? sql`${logsTable.message} LIKE ${likePattern} ESCAPE '\\'`
          : undefined,
        startTsFilter(logsTable.ts, startTs),
        endTsFilter(logsTable.ts, endTs),
        cursorFilter(logsTable.id, cursor, order),
      ))
      .orderBy(order === "asc" ? asc(logsTable.id) : desc(logsTable.id))
      .limit(limit + 1)
      .all();

    const hasMore = rows.length > limit;
    const resultRows = hasMore ? rows.slice(0, limit) : rows;

    return {
      logs: resultRows.map(mapRowToStoredEvent),
      nextCursor: hasMore ? resultRows.at(-1)?.id ?? null : null,
    };
  }

  clear(params: Partial<LogQueryParams> = {}): number {
    if (!this.db) { return 0; }

    const { level, source, pluginName, startTs, endTs } = params;

    const deleted = this.db
      .delete(logsTable)
      .where(and(
        oneOrMany(logsTable.level, level),
        oneOrMany(logsTable.source, source),
        pluginName ? eq(logsTable.pluginName, pluginName) : undefined,
        startTsFilter(logsTable.ts, startTs),
        endTsFilter(logsTable.ts, endTs),
      ))
      .returning({ id: logsTable.id })
      .all();

    return deleted.length;
  }

  getPluginNames(): string[] {
    if (!this.db) { return []; }

    return this.db
      .selectDistinct({ pluginName: logsTable.pluginName })
      .from(logsTable)
      .where(isNotNull(logsTable.pluginName))
      .orderBy(asc(logsTable.pluginName))
      .all()
      .map((r) => r.pluginName as string);
  }

  getSources(): LogSource[] {
    if (!this.db) { return []; }

    return this.db
      .selectDistinct({ source: logsTable.source })
      .from(logsTable)
      .orderBy(asc(logsTable.source))
      .all()
      .map((r) => r.source as LogSource);
  }

  count(): number {
    if (!this.db) { return 0; }

    return this.db
      .select({ value: count() })
      .from(logsTable)
      .get()?.value ?? 0;
  }

  /**
   * Flush and close the underlying SQLite database. Idempotent: the
   * graceful-shutdown path may call this both on the clean stop and again
   * from the hard-timeout fallback, so a second call must be a harmless
   * no-op rather than throwing on an already-closed handle.
   */
  close(): void {
    this.stopRetention();
    // Drain any buffered events before releasing the handle so a clean stop
    // (or a crash-handler close) never loses the tail of the log stream.
    this.flush();
    if (this.#database) {
      this.#database.sqlite.close();
      this.#database = null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Row → StoredLogEvent mapping
// ─────────────────────────────────────────────────────────────────────────────

type LogRow = typeof logsTable.$inferSelect;

function mapRowToStoredEvent(row: LogRow): StoredLogEvent {
  const event: StoredLogEvent = {
    id: row.id,
    ts: row.ts,
    level: row.level as LogLevel,
    source: row.source as LogSource,
    pluginName: row.pluginName ?? undefined,
    message: row.message,
    meta: row.meta ? (JSON.parse(row.meta) as Record<string, Json>) : undefined,
  };

  if (row.errorName || row.errorMessage) {
    event.error = {
      name: row.errorName ?? "Error",
      message: row.errorMessage ?? "",
      stack: row.errorStack ?? undefined,
      cause: row.errorCause ?? undefined,
    };
  }

  return event;
}
