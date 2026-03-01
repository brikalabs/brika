/**
 * SQLite-based Log Storage
 *
 * Persists logs to disk for historical queries with filtering and pagination.
 */

import { Database, SQLQueryBindings } from 'bun:sqlite'
import { mkdir } from 'node:fs/promises';
import { inject, singleton } from "@brika/di";
import { ConfigLoader } from "@/runtime/config/config-loader";
import type { Json } from "@/types";
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

interface LogRow {
  id: number;
  ts: number;
  level: string;
  source: string;
  plugin_name: string | null;
  message: string;
  meta: string | null;
  error_name: string | null;
  error_message: string | null;
  error_stack: string | null;
  error_cause: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Log Store Service
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class LogStore {
  #db: Database | null = null;
  #insertStmt: ReturnType<Database["prepare"]> | null = null;

  async init(): Promise<void> {
    const configLoader = inject(ConfigLoader);
    const rootDir = configLoader.getRootDir();
    const dbPath = `${rootDir}/.brika/logs.db`;

    // Ensure .brika directory exists
    const brikaDir = `${rootDir}/.brika`;
    await mkdir(brikaDir, { recursive: true });

    this.#db = new Database(dbPath);

    // Create table
    this.#db.run(`
        CREATE TABLE IF NOT EXISTS logs
        (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            ts           INTEGER NOT NULL,
            level        TEXT    NOT NULL,
            source       TEXT    NOT NULL,
            plugin_name  TEXT,
            message      TEXT    NOT NULL,
            meta         TEXT,
            error_name   TEXT,
            error_message TEXT,
            error_stack  TEXT,
            error_cause  TEXT
        )
    `);

    // Migrate existing schema to add error columns if they don't exist
    const columns = this.#db.query("PRAGMA table_info(logs)").all() as { name: string }[];
    const columnNames = new Set(columns.map((c) => c.name));

    if (!columnNames.has("error_name")) {
      this.#db.run("ALTER TABLE logs ADD COLUMN error_name TEXT");
    }
    if (!columnNames.has("error_message")) {
      this.#db.run("ALTER TABLE logs ADD COLUMN error_message TEXT");
    }
    if (!columnNames.has("error_stack")) {
      this.#db.run("ALTER TABLE logs ADD COLUMN error_stack TEXT");
    }
    if (!columnNames.has("error_cause")) {
      this.#db.run("ALTER TABLE logs ADD COLUMN error_cause TEXT");
    }

    // Create indexes for efficient queries
    this.#db.run("CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts DESC)");
    this.#db.run("CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)");
    this.#db.run("CREATE INDEX IF NOT EXISTS idx_logs_source ON logs(source)");
    this.#db.run("CREATE INDEX IF NOT EXISTS idx_logs_plugin ON logs(plugin_name)");
    this.#db.run("CREATE INDEX IF NOT EXISTS idx_logs_ts_level ON logs(ts DESC, level)");
    this.#db.run("CREATE INDEX IF NOT EXISTS idx_logs_ts_source ON logs (ts DESC, source)");

    // Prepare insert statement for performance
    this.#insertStmt = this.#db.prepare(
      "INSERT INTO logs (ts, level, source, plugin_name, message, meta, error_name, error_message, error_stack, error_cause) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
  }

  insert(event: LogEvent): void {
    if (!this.#insertStmt) { return; }

    this.#insertStmt.run(
      event.ts,
      event.level,
      event.source,
      event.pluginName ?? null,
      event.message,
      event.meta ? JSON.stringify(event.meta) : null,
      event.error?.name ?? null,
      event.error?.message ?? null,
      event.error?.stack ?? null,
      event.error?.cause ?? null,
    );
  }

  query(params: LogQueryParams = {}): LogQueryResult {
    if (!this.#db) { return { logs: [], nextCursor: null }; }

    const { conditions, values } = this.buildWhereConditions(params);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(params.limit ?? 100, 1000);
    const order = params.order ?? "desc";

    // Query one extra to determine if there's a next page
    const sql = `
        SELECT id, ts, level, source, plugin_name, message, meta, error_name, error_message, error_stack, error_cause
        FROM logs ${whereClause}
        ORDER BY id ${order === "desc" ? "DESC" : "ASC"}
        LIMIT ?
    `;

    const rows = this.#db.query(sql).all(...values, limit + 1) as LogRow[];

    const hasMore = rows.length > limit;
    const resultRows = hasMore ? rows.slice(0, limit) : rows;
    const logs = resultRows.map((row) => this.mapRowToLogEvent(row));

    return {
      logs,
      nextCursor: hasMore ? resultRows.at(-1)?.id ?? null : null,
    };
  }

  /**
   * Build common filter conditions for level, source, pluginName, time range
   */
  private buildFilterConditions(params: Partial<LogQueryParams>): {
    conditions: string[];
    values: SQLQueryBindings[];
  } {
    const conditions: string[] = [];
    const values: SQLQueryBindings[] = [];

    if (params.level) {
      const levels = Array.isArray(params.level) ? params.level : [params.level];
      conditions.push(`level IN (${levels.map(() => "?").join(", ")})`);
      values.push(...levels);
    }

    if (params.source) {
      const sources = Array.isArray(params.source) ? params.source : [params.source];
      conditions.push(`source IN (${sources.map(() => "?").join(", ")})`);
      values.push(...sources);
    }

    if (params.pluginName) {
      conditions.push("plugin_name = ?");
      values.push(params.pluginName);
    }

    if (params.startTs) {
      conditions.push("ts >= ?");
      values.push(params.startTs);
    }

    if (params.endTs) {
      conditions.push("ts <= ?");
      values.push(params.endTs);
    }

    return { conditions, values };
  }

  /**
   * Build WHERE clause conditions and values from query params (includes search + cursor)
   */
  private buildWhereConditions(params: LogQueryParams): {
    conditions: string[];
    values: SQLQueryBindings[];
  } {
    const { conditions, values } = this.buildFilterConditions(params);

    if (params.search) {
      conditions.push("message LIKE ?");
      values.push(`%${params.search}%`);
    }

    // Cursor-based pagination
    const order = params.order ?? "desc";
    if (params.cursor) {
      conditions.push(order === "desc" ? "id < ?" : "id > ?");
      values.push(params.cursor);
    }

    return { conditions, values };
  }

  /**
   * Map database row to StoredLogEvent
   */
  private mapRowToLogEvent(row: LogRow): StoredLogEvent {
    const event: StoredLogEvent = {
      id: row.id,
      ts: row.ts,
      level: row.level as LogLevel,
      source: row.source as LogSource,
      pluginName: row.plugin_name ?? undefined,
      message: row.message,
      meta: row.meta ? (JSON.parse(row.meta) as Record<string, Json>) : undefined,
    };

    // Reconstruct error object if error data exists
    if (row.error_name || row.error_message) {
      event.error = {
        name: row.error_name ?? "Error",
        message: row.error_message ?? "",
        stack: row.error_stack ?? undefined,
        cause: row.error_cause ?? undefined,
      };
    }

    return event;
  }

  clear(params: Partial<LogQueryParams> = {}): number {
    if (!this.#db) { return 0; }

    const { conditions, values } = this.buildFilterConditions(params);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = this.#db.run(
      `DELETE FROM logs ${whereClause}`,
      values,
    );

    return result.changes;
  }

  getPluginNames(): string[] {
    if (!this.#db) { return []; }

    const rows = this.#db
      .query("SELECT DISTINCT plugin_name FROM logs WHERE plugin_name IS NOT NULL ORDER BY plugin_name")
      .all() as { plugin_name: string }[];

    return rows.map((r) => r.plugin_name);
  }

  getSources(): LogSource[] {
    if (!this.#db) { return []; }

    const rows = this.#db
      .query("SELECT DISTINCT source FROM logs ORDER BY source")
      .all() as { source: string }[];

    return rows.map((r) => r.source as LogSource);
  }

  count(): number {
    if (!this.#db) { return 0; }

    const row = this.#db
      .query("SELECT COUNT(*) as count FROM logs")
      .get() as { count: number } | null;

    return row?.count ?? 0;
  }

  close () {
    this.#db?.close();
  }
}
