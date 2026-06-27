import {
  and, asc, type BrikaDatabase, count, cursorFilter, desc, endTsFilter,
  eq, isNotNull, lt, oneOrMany, sql, startTsFilter, TimeSeriesStore,
} from "@brika/db";
import { singleton } from "@brika/di";
import type { Json } from "@/types";
import { logsDb } from "./database";
import { logs as logsTable } from "./schema";
import type { LogEvent, LogLevel, LogSource } from "./types";

type LogSchema = { logs: typeof logsTable };

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

/**
 * SQLite-backed store for hub + plugin logs. The batched-write hot path,
 * retention sweep, and lifecycle live in {@link TimeSeriesStore}; this class
 * adds the `logs`-table row mapping and the log-specific read APIs.
 */
@singleton()
export class LogStore extends TimeSeriesStore<LogEvent, LogSchema> {
  protected openDatabase(): BrikaDatabase<LogSchema> {
    return logsDb.open();
  }

  protected writeRow(event: LogEvent): void {
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

  protected deleteOlderThan(cutoff: number): number {
    return (
      this.db
        ?.delete(logsTable)
        .where(lt(logsTable.ts, cutoff))
        .returning({ id: logsTable.id })
        .all().length ?? 0
    );
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
