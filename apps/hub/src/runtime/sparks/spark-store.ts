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

type SparkFilterParams = Pick<
  SparkQueryParams,
  'type' | 'source' | 'pluginId' | 'startTs' | 'endTs'
>;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Spark Store Service
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class SparkStore {
  #db: Database | null = null;
  #insertStmt: ReturnType<Database['prepare']> | null = null;

  #appendInClause(
    conditions: string[],
    values: SQLQueryBindings[],
    column: string,
    value?: string | string[]
  ): void {
    if (!value) return;

    const list = Array.isArray(value) ? value : [value];
    if (list.length === 0) return;

    conditions.push(`${column} IN (${list.map(() => '?').join(', ')})`);
    values.push(...list);
  }

  #buildFilterConditions(params: SparkFilterParams): {
    conditions: string[];
    values: SQLQueryBindings[];
  } {
    const conditions: string[] = [];
    const values: SQLQueryBindings[] = [];

    this.#appendInClause(conditions, values, 'type', params.type);
    this.#appendInClause(conditions, values, 'source', params.source);

    if (params.pluginId) {
      conditions.push('plugin_id = ?');
      values.push(params.pluginId);
    }

    if (params.startTs != null) {
      conditions.push('ts >= ?');
      values.push(params.startTs);
    }

    if (params.endTs != null) {
      conditions.push('ts <= ?');
      values.push(params.endTs);
    }

    return { conditions, values };
  }

  #appendCursorCondition(
    conditions: string[],
    values: SQLQueryBindings[],
    cursor: number | undefined,
    order: 'asc' | 'desc'
  ): void {
    if (cursor == null) return;

    const operator = order === 'desc' ? '<' : '>';
    conditions.push(`id ${operator} ?`);
    values.push(cursor);
  }

  #buildWhereClause(conditions: string[]): string {
    return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  }

  #normalizeLimit(limit?: number): number {
    return Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  }

  #orderKeyword(order: 'asc' | 'desc'): 'ASC' | 'DESC' {
    return order === 'desc' ? 'DESC' : 'ASC';
  }

  #toStoredSpark(row: SparkRow): StoredSparkEvent {
    return {
      id: row.id,
      ts: row.ts,
      type: row.type,
      source: row.source,
      pluginId: row.plugin_id,
      payload: row.payload ? (JSON.parse(row.payload) as Json) : null,
    };
  }

  #paginate(
    rows: SparkRow[],
    limit: number
  ): {
    rows: SparkRow[];
    nextCursor: number | null;
  } {
    if (limit <= 0) {
      return { rows: [], nextCursor: null };
    }

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    return {
      rows: pageRows,
      nextCursor: hasMore ? pageRows[pageRows.length - 1].id : null,
    };
  }

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

    const { conditions, values } = this.#buildFilterConditions(params);

    // Cursor-based pagination
    const order = params.order ?? 'desc';
    this.#appendCursorCondition(conditions, values, params.cursor, order);

    const whereClause = this.#buildWhereClause(conditions);
    const limit = this.#normalizeLimit(params.limit);

    // Query one extra to determine if there's a next page
    const sql = `
      SELECT id, ts, type, source, plugin_id, payload
      FROM sparks ${whereClause}
      ORDER BY id ${this.#orderKeyword(order)}
      LIMIT ?
    `;

    const rows = this.#db.query(sql).all(...values, limit + 1) as SparkRow[];

    const { rows: pageRows, nextCursor } = this.#paginate(rows, limit);
    const sparks = pageRows.map((row) => this.#toStoredSpark(row));

    return {
      sparks,
      nextCursor,
    };
  }

  clear(params: Partial<SparkQueryParams> = {}): number {
    if (!this.#db) return 0;

    const { conditions, values } = this.#buildFilterConditions(params);

    const whereClause = this.#buildWhereClause(conditions);
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
