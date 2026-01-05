/**
 * SQLite-based Log Storage
 *
 * Persists logs to disk for historical queries with filtering and pagination.
 */

import { Database, SQLQueryBindings } from 'bun:sqlite'
import type { Json, LogEvent, LogLevel, LogSource } from "@brika/shared";
import { inject, singleton } from "@brika/shared";
import { ConfigLoader } from "@/runtime/config/config-loader";

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
    const dirExists = await Bun.file(brikaDir)
      .exists()
      .catch(() => false);
    if (!dirExists) {
      await Bun.$`mkdir -p ${brikaDir}`.quiet();
    }

    this.#db = new Database(dbPath);

    // Create table
    this.#db.run(`
        CREATE TABLE IF NOT EXISTS logs
        (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            ts          INTEGER NOT NULL,
            level       TEXT    NOT NULL,
            source      TEXT    NOT NULL,
            plugin_name TEXT,
            message     TEXT    NOT NULL,
            meta        TEXT
        )
    `);

    // Migrate old plugin_ref column to plugin_name if needed
    try {
      // Check if the old column exists by trying to query it
      const testQuery = this.#db.query("SELECT plugin_ref FROM logs LIMIT 1");
      try {
        testQuery.all();
        // Old column exists, need to migrate
        console.log('[log-store] Migrating plugin_ref → plugin_name');

        // SQLite doesn't support column rename directly in old versions, so we do it via ALTER TABLE
        this.#db.run("ALTER TABLE logs RENAME COLUMN plugin_ref TO plugin_name");
        console.log('[log-store] Migration complete');
      } catch {
        // Column doesn't exist or query failed, nothing to migrate
      }
    } catch {
      // Table doesn't exist yet or other error, ignore
    }

    // Create indexes for efficient queries
    this.#db.run("CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts DESC)");
    this.#db.run("CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)");
    this.#db.run("CREATE INDEX IF NOT EXISTS idx_logs_source ON logs(source)");
    this.#db.run("CREATE INDEX IF NOT EXISTS idx_logs_plugin ON logs(plugin_name)");
    this.#db.run("CREATE INDEX IF NOT EXISTS idx_logs_ts_level ON logs(ts DESC, level)");
    // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
    this.#db.run(`CREATE INDEX IF NOT EXISTS idx_logs_ts_source ON logs (ts DESC, source)`);

    // Prepare insert statement for performance
    this.#insertStmt = this.#db.prepare(
      "INSERT INTO logs (ts, level, source, plugin_name, message, meta) VALUES (?, ?, ?, ?, ?, ?)",
    );
  }

  insert(event: LogEvent): void {
    if (!this.#insertStmt) return;

    this.#insertStmt.run(
      event.ts,
      event.level,
      event.source,
      event.pluginName ?? null,
      event.message,
      event.meta ? JSON.stringify(event.meta) : null,
    );
  }

  query(params: LogQueryParams = {}): LogQueryResult {
    if (!this.#db) return { logs: [], nextCursor: null };

    const conditions: string[] = [];
    const values: SQLQueryBindings[] = [];

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

    if (params.pluginName) {
      conditions.push("plugin_name = ?");
      values.push(params.pluginName);
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
        SELECT id, ts, level, source, plugin_name, message, meta
        FROM logs ${whereClause}
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
      pluginName: row.plugin_name ?? undefined,
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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = this.#db.run(
      `DELETE FROM logs ${whereClause}`,
      values,
    );

    return result.changes;
  }

  getPluginNames(): string[] {
    if (!this.#db) return [];

    const rows = this.#db
      .query("SELECT DISTINCT plugin_name FROM logs WHERE plugin_name IS NOT NULL ORDER BY plugin_name")
      .all() as { plugin_name: string }[];

    return rows.map((r) => r.plugin_name);
  }

  close () {
    this.#db?.close();
  }
}
