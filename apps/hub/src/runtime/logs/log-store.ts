/**
 * SQLite-based Log Storage
 *
 * Persists logs to disk for historical queries with filtering and pagination.
 */

import { Database } from "bun:sqlite";
import { singleton, inject } from "@elia/shared";
import type { LogEvent, LogLevel, LogSource, Json } from "@elia/shared";
import { ConfigLoader } from "../config/config-loader";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LogQueryParams {
  level?: LogLevel | LogLevel[];
  source?: LogSource | LogSource[];
  pluginRef?: string;
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
  plugin_ref: string | null;
  message: string;
  meta: string | null;
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
    const dbPath = `${rootDir}/.elia/logs.db`;

    // Ensure .elia directory exists
    const eliaDir = `${rootDir}/.elia`;
    const dirExists = await Bun.file(eliaDir)
      .exists()
      .catch(() => false);
    if (!dirExists) {
      await Bun.$`mkdir -p ${eliaDir}`.quiet();
    }

    this.#db = new Database(dbPath);

    // Create table
    this.#db.run(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        level TEXT NOT NULL,
        source TEXT NOT NULL,
        plugin_ref TEXT,
        message TEXT NOT NULL,
        meta TEXT
      )
    `);

    // Create indexes for efficient queries
    this.#db.run("CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts DESC)");
    this.#db.run("CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)");
    this.#db.run("CREATE INDEX IF NOT EXISTS idx_logs_source ON logs(source)");
    this.#db.run("CREATE INDEX IF NOT EXISTS idx_logs_plugin ON logs(plugin_ref)");
    this.#db.run("CREATE INDEX IF NOT EXISTS idx_logs_ts_level ON logs(ts DESC, level)");
    // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
    this.#db.run(`CREATE INDEX IF NOT EXISTS idx_logs_ts_source ON logs(ts DESC, source)`);

    // Prepare insert statement for performance
    this.#insertStmt = this.#db.prepare(
      "INSERT INTO logs (ts, level, source, plugin_ref, message, meta) VALUES (?, ?, ?, ?, ?, ?)",
    );
  }

  insert(event: LogEvent): void {
    if (!this.#insertStmt) return;

    this.#insertStmt.run(
      event.ts,
      event.level,
      event.source,
      event.pluginRef ?? null,
      event.message,
      event.meta ? JSON.stringify(event.meta) : null,
    );
  }

  query(params: LogQueryParams = {}): LogQueryResult {
    if (!this.#db) return { logs: [], nextCursor: null };

    const conditions: string[] = [];
    const values: unknown[] = [];

    // Build WHERE clauses
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

    if (params.pluginRef) {
      conditions.push("plugin_ref = ?");
      values.push(params.pluginRef);
    }

    if (params.search) {
      conditions.push("message LIKE ?");
      values.push(`%${params.search}%`);
    }

    if (params.startTs) {
      conditions.push("ts >= ?");
      values.push(params.startTs);
    }

    if (params.endTs) {
      conditions.push("ts <= ?");
      values.push(params.endTs);
    }

    // Cursor-based pagination
    const order = params.order ?? "desc";
    if (params.cursor) {
      if (order === "desc") {
        conditions.push("id < ?");
      } else {
        conditions.push("id > ?");
      }
      values.push(params.cursor);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Math.min(params.limit ?? 100, 1000);

    // Query one extra to determine if there's a next page
    const sql = `
      SELECT id, ts, level, source, plugin_ref, message, meta
      FROM logs
      ${whereClause}
      ORDER BY id ${order === "desc" ? "DESC" : "ASC"}
      LIMIT ?
    `;

    const rows = this.#db.query(sql).all(...values, limit + 1) as LogRow[];

    const hasMore = rows.length > limit;
    const resultRows = hasMore ? rows.slice(0, limit) : rows;

    const logs = resultRows.map((row) => ({
      id: row.id,
      ts: row.ts,
      level: row.level as LogLevel,
      source: row.source as LogSource,
      pluginRef: row.plugin_ref ?? undefined,
      message: row.message,
      meta: row.meta ? (JSON.parse(row.meta) as Record<string, Json>) : undefined,
    }));

    return {
      logs,
      nextCursor: hasMore ? resultRows[resultRows.length - 1].id : null,
    };
  }

  clear(params: Partial<LogQueryParams> = {}): number {
    if (!this.#db) return 0;

    const conditions: string[] = [];
    const values: unknown[] = [];

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

    if (params.pluginRef) {
      conditions.push("plugin_ref = ?");
      values.push(params.pluginRef);
    }

    if (params.startTs) {
      conditions.push("ts >= ?");
      values.push(params.startTs);
    }

    if (params.endTs) {
      conditions.push("ts <= ?");
      values.push(params.endTs);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = this.#db.run(`DELETE FROM logs ${whereClause}`, values);

    return result.changes;
  }

  getPluginRefs(): string[] {
    if (!this.#db) return [];

    const rows = this.#db
      .query("SELECT DISTINCT plugin_ref FROM logs WHERE plugin_ref IS NOT NULL ORDER BY plugin_ref")
      .all() as { plugin_ref: string }[];

    return rows.map((r) => r.plugin_ref);
  }

  count(): number {
    if (!this.#db) return 0;

    const row = this.#db.query("SELECT COUNT(*) as count FROM logs").get() as { count: number };
    return row.count;
  }

  close(): void {
    this.#insertStmt?.finalize();
    this.#db?.close();
    this.#db = null;
    this.#insertStmt = null;
  }
}
