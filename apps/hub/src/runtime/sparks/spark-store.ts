/**
 * SQLite-based Spark Event Storage
 *
 * Persists spark events to disk for historical queries with filtering and pagination.
 */

import { Database, type SQLQueryBindings } from 'bun:sqlite';
import type { Json } from '@brika/shared';
import { inject, singleton } from '@brika/shared';
import { ConfigLoader } from '@/runtime/config/config-loader';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SparkQueryParams {
  type?: string | string[];
  source?: string | string[];
  pluginId?: string;
  startTs?: number;
  endTs?: number;
  cursor?: number;
  limit?: number;
  order?: 'asc' | 'desc';
}

export interface SparkQueryResult {
  sparks: StoredSparkEvent[];
  nextCursor: number | null;
}

export interface StoredSparkEvent {
  id: number;
  ts: number;
  type: string;
  source: string;
  pluginId: string | null;
  payload: Json;
}

interface SparkRow {
  id: number;
  ts: number;
  type: string;
  source: string;
  plugin_id: string | null;
  payload: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Spark Store Service
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class SparkStore {
  #db: Database | null = null;
  #insertStmt: ReturnType<Database['prepare']> | null = null;

  async init(): Promise<void> {
    const configLoader = inject(ConfigLoader);
    const rootDir = configLoader.getRootDir();
    const dbPath = `${rootDir}/.brika/sparks.db`;

    // Ensure .brika directory exists
    const brikaDir = `${rootDir}/.brika`;
    await Bun.$`mkdir -p ${brikaDir}`.quiet();

    this.#db = new Database(dbPath);

    // Create table
    this.#db.run(`
      CREATE TABLE IF NOT EXISTS sparks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        type TEXT NOT NULL,
        source TEXT NOT NULL,
        plugin_id TEXT,
        payload TEXT
      )
    `);

    // Create indexes for efficient queries
    this.#db.run('CREATE INDEX IF NOT EXISTS idx_sparks_ts ON sparks(ts DESC)');
    this.#db.run('CREATE INDEX IF NOT EXISTS idx_sparks_type ON sparks(type)');
    this.#db.run('CREATE INDEX IF NOT EXISTS idx_sparks_source ON sparks(source)');
    this.#db.run('CREATE INDEX IF NOT EXISTS idx_sparks_plugin ON sparks(plugin_id)');
    this.#db.run('CREATE INDEX IF NOT EXISTS idx_sparks_ts_type ON sparks(ts DESC, type)');

    // Prepare insert statement for performance
    this.#insertStmt = this.#db.prepare(
      'INSERT INTO sparks (ts, type, source, plugin_id, payload) VALUES (?, ?, ?, ?, ?)'
    );
  }

  insert(event: Omit<StoredSparkEvent, 'id'>): void {
    if (!this.#insertStmt) return;

    this.#insertStmt.run(
      event.ts,
      event.type,
      event.source,
      event.pluginId ?? null,
      event.payload != null ? JSON.stringify(event.payload) : null
    );
  }

  query(params: SparkQueryParams = {}): SparkQueryResult {
    if (!this.#db) return { sparks: [], nextCursor: null };

    const conditions: string[] = [];
    const values: SQLQueryBindings[] = [];

    // Build WHERE clauses
    if (params.type) {
      const types = Array.isArray(params.type) ? params.type : [params.type];
      conditions.push(`type IN (${types.map(() => '?').join(', ')})`);
      values.push(...types);
    }

    if (params.source) {
      const sources = Array.isArray(params.source) ? params.source : [params.source];
      conditions.push(`source IN (${sources.map(() => '?').join(', ')})`);
      values.push(...sources);
    }

    if (params.pluginId) {
      conditions.push('plugin_id = ?');
      values.push(params.pluginId);
    }

    if (params.startTs) {
      conditions.push('ts >= ?');
      values.push(params.startTs);
    }

    if (params.endTs) {
      conditions.push('ts <= ?');
      values.push(params.endTs);
    }

    // Cursor-based pagination
    const order = params.order ?? 'desc';
    if (params.cursor) {
      if (order === 'desc') {
        conditions.push('id < ?');
      } else {
        conditions.push('id > ?');
      }
      values.push(params.cursor);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(params.limit ?? 100, 1000);

    // Query one extra to determine if there's a next page
    const sql = `
      SELECT id, ts, type, source, plugin_id, payload
      FROM sparks ${whereClause}
      ORDER BY id ${order === 'desc' ? 'DESC' : 'ASC'}
      LIMIT ?
    `;

    const rows = this.#db.query(sql).all(...values, limit + 1) as SparkRow[];

    const hasMore = rows.length > limit;
    const resultRows = hasMore ? rows.slice(0, limit) : rows;

    const sparks = resultRows.map((row) => ({
      id: row.id,
      ts: row.ts,
      type: row.type,
      source: row.source,
      pluginId: row.plugin_id,
      payload: row.payload ? (JSON.parse(row.payload) as Json) : null,
    }));

    return {
      sparks,
      nextCursor: hasMore ? resultRows[resultRows.length - 1].id : null,
    };
  }

  clear(params: Partial<SparkQueryParams> = {}): number {
    if (!this.#db) return 0;

    const conditions: string[] = [];
    const values: SQLQueryBindings[] = [];

    if (params.type) {
      const types = Array.isArray(params.type) ? params.type : [params.type];
      conditions.push(`type IN (${types.map(() => '?').join(', ')})`);
      values.push(...types);
    }

    if (params.source) {
      const sources = Array.isArray(params.source) ? params.source : [params.source];
      conditions.push(`source IN (${sources.map(() => '?').join(', ')})`);
      values.push(...sources);
    }

    if (params.pluginId) {
      conditions.push('plugin_id = ?');
      values.push(params.pluginId);
    }

    if (params.startTs) {
      conditions.push('ts >= ?');
      values.push(params.startTs);
    }

    if (params.endTs) {
      conditions.push('ts <= ?');
      values.push(params.endTs);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = this.#db.run(`DELETE FROM sparks ${whereClause}`, values);

    return result.changes;
  }

  getTypes(): string[] {
    if (!this.#db) return [];

    const rows = this.#db.query('SELECT DISTINCT type FROM sparks ORDER BY type').all() as {
      type: string;
    }[];

    return rows.map((r) => r.type);
  }

  count(): number {
    if (!this.#db) return 0;

    const row = this.#db.query('SELECT COUNT(*) as count FROM sparks').get() as {
      count: number;
    } | null;

    return row?.count ?? 0;
  }

  close(): void {
    this.#db?.close();
  }
}
