import {
  and,
  asc,
  type BrikaDatabase,
  count,
  cursorFilter,
  desc,
  endTsFilter,
  eq,
  isNotNull,
  oneOrMany,
  startTsFilter,
} from '@brika/db';
import { singleton } from '@brika/di';
import type { Json } from '@/types';
import { sparksDb } from './database';
import { sparks as sparksTable } from './schema';

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

// ─────────────────────────────────────────────────────────────────────────────
// Spark Store Service
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class SparkStore {
  #database: BrikaDatabase<{ sparks: typeof sparksTable }> | null = null;

  init(): void {
    this.#database = sparksDb.open();
  }

  private get db() {
    return this.#database?.db ?? null;
  }

  insert(event: Omit<StoredSparkEvent, 'id'>): void {
    if (!this.db) {
      return;
    }

    this.db
      .insert(sparksTable)
      .values({
        ts: event.ts,
        type: event.type,
        source: event.source,
        pluginId: event.pluginId ?? null,
        payload:
          event.payload === null || event.payload === undefined
            ? null
            : JSON.stringify(event.payload),
      })
      .run();
  }

  query(params: SparkQueryParams = {}): SparkQueryResult {
    if (!this.db) {
      return { sparks: [], nextCursor: null };
    }

    const { type, source, pluginId, startTs, endTs, cursor } = params;
    const limit = Math.min(params.limit ?? 100, 1000);
    const order = params.order ?? 'desc';

    const rows = this.db
      .select()
      .from(sparksTable)
      .where(
        and(
          oneOrMany(sparksTable.type, type),
          oneOrMany(sparksTable.source, source),
          pluginId ? eq(sparksTable.pluginId, pluginId) : undefined,
          startTsFilter(sparksTable.ts, startTs),
          endTsFilter(sparksTable.ts, endTs),
          cursorFilter(sparksTable.id, cursor, order)
        )
      )
      .orderBy(order === 'asc' ? asc(sparksTable.id) : desc(sparksTable.id))
      .limit(limit + 1)
      .all();

    const hasMore = rows.length > limit;
    const resultRows = hasMore ? rows.slice(0, limit) : rows;

    return {
      sparks: resultRows.map(mapRowToStoredSpark),
      nextCursor: hasMore ? (resultRows.at(-1)?.id ?? null) : null,
    };
  }

  clear(params: Partial<SparkQueryParams> = {}): number {
    if (!this.db) {
      return 0;
    }

    const { type, source, pluginId, startTs, endTs } = params;

    const deleted = this.db
      .delete(sparksTable)
      .where(
        and(
          oneOrMany(sparksTable.type, type),
          oneOrMany(sparksTable.source, source),
          pluginId ? eq(sparksTable.pluginId, pluginId) : undefined,
          startTsFilter(sparksTable.ts, startTs),
          endTsFilter(sparksTable.ts, endTs)
        )
      )
      .returning({ id: sparksTable.id })
      .all();

    return deleted.length;
  }

  getTypes(): string[] {
    if (!this.db) {
      return [];
    }

    return this.db
      .selectDistinct({ type: sparksTable.type })
      .from(sparksTable)
      .where(isNotNull(sparksTable.type))
      .orderBy(asc(sparksTable.type))
      .all()
      .map((r) => r.type);
  }

  count(): number {
    if (!this.db) {
      return 0;
    }

    return this.db.select({ value: count() }).from(sparksTable).get()?.value ?? 0;
  }

  close(): void {
    this.#database?.sqlite.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Row → StoredSparkEvent mapping
// ─────────────────────────────────────────────────────────────────────────────

type SparkRow = typeof sparksTable.$inferSelect;

function mapRowToStoredSpark(row: SparkRow): StoredSparkEvent {
  return {
    id: row.id,
    ts: row.ts,
    type: row.type,
    source: row.source,
    pluginId: row.pluginId,
    payload: row.payload ? (JSON.parse(row.payload) as Json) : null,
  };
}
