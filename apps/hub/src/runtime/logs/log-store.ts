import {
  and, asc, type BrikaDatabase, count, cursorFilter, desc, endTsFilter,
  eq, isNotNull, like, oneOrMany, startTsFilter,
} from "@brika/db";
import { singleton } from "@brika/di";
import type { Json } from "@/types";
import { logsDb } from "./database";
import { logs as logsTable } from "./schema";
import type { LogEvent, LogLevel, LogSource } from "./types";

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

  init(): void {
    this.#database = logsDb.open();
  }

  private get db() {
    return this.#database?.db ?? null;
  }

  insert(event: LogEvent): void {
    if (!this.db || this.#insertDisabled) { return; }

    try {
      this.db.insert(logsTable).values({
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

  query(params: LogQueryParams = {}): LogQueryResult {
    if (!this.db) { return { logs: [], nextCursor: null }; }

    const { level, source, pluginName, search, startTs, endTs, cursor } = params;
    const limit = Math.min(params.limit ?? 100, 1000);
    const order = params.order ?? "desc";

    const rows = this.db
      .select()
      .from(logsTable)
      .where(and(
        oneOrMany(logsTable.level, level),
        oneOrMany(logsTable.source, source),
        pluginName ? eq(logsTable.pluginName, pluginName) : undefined,
        search ? like(logsTable.message, `%${search}%`) : undefined,
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

  close(): void {
    this.#database?.sqlite.close();
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
