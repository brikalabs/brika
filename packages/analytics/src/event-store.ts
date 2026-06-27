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
  lt,
  oneOrMany,
  sql,
  startTsFilter,
  TimeSeriesStore,
} from '@brika/db';
import { singleton } from '@brika/di';
import { eventsDb } from './database';
import { events as eventsTable } from './schema';
import type { CaptureEvent, CaptureSource, Json } from './types';

type EventSchema = { events: typeof eventsTable };

/** Narrow a stored source string to the {@link CaptureSource} union. */
function isCaptureSource(value: string): value is CaptureSource {
  return value === 'hub' || value === 'plugin' || value === 'ui' || value === 'cli';
}

/**
 * Escape SQLite LIKE wildcards (`%`, `_`) and the escape char itself so user
 * input is matched literally. Pair with `ESCAPE '\\'` in the query.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EventQueryParams {
  name?: string | string[];
  source?: CaptureSource | CaptureSource[];
  pluginName?: string;
  distinctId?: string;
  userId?: string;
  search?: string;
  startTs?: number;
  endTs?: number;
  cursor?: number;
  limit?: number;
  order?: 'asc' | 'desc';
}

export interface EventQueryResult {
  events: StoredCaptureEvent[];
  nextCursor: number | null;
}

export interface StoredCaptureEvent extends CaptureEvent {
  id: number;
}

export interface EventNameCount {
  name: string;
  count: number;
}

export interface SourceCount {
  source: CaptureSource;
  count: number;
}

export interface PluginCount {
  pluginName: string;
  count: number;
}

export interface TimeBucket {
  /** Start timestamp (ms) of the bucket window. */
  bucket: number;
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Store Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SQLite-backed store for captured feature-usage events. The batched-write hot
 * path, retention sweep, and lifecycle live in {@link TimeSeriesStore}; this
 * class adds the `events`-table row mapping and the analytics read/aggregate APIs.
 */
@singleton()
export class EventStore extends TimeSeriesStore<CaptureEvent, EventSchema> {
  protected openDatabase(): BrikaDatabase<EventSchema> {
    return eventsDb.open();
  }

  protected writeRow(event: CaptureEvent): void {
    this.db
      ?.insert(eventsTable)
      .values({
        ts: event.ts,
        name: event.name,
        source: event.source,
        distinctId: event.distinctId ?? null,
        userId: event.userId ?? null,
        pluginName: event.pluginName ?? null,
        props: event.props ? JSON.stringify(event.props) : null,
      })
      .run();
  }

  protected deleteOlderThan(cutoff: number): number {
    return (
      this.db
        ?.delete(eventsTable)
        .where(lt(eventsTable.ts, cutoff))
        .returning({ id: eventsTable.id })
        .all().length ?? 0
    );
  }

  query(params: EventQueryParams = {}): EventQueryResult {
    if (!this.db) {
      return { events: [], nextCursor: null };
    }

    const { name, source, pluginName, distinctId, userId, search, startTs, endTs, cursor } = params;
    const limit = Math.min(params.limit ?? 100, 1000);
    const order = params.order ?? 'desc';

    const rows = this.db
      .select()
      .from(eventsTable)
      .where(
        and(
          oneOrMany(eventsTable.name, name),
          oneOrMany(eventsTable.source, source),
          pluginName ? eq(eventsTable.pluginName, pluginName) : undefined,
          distinctId ? eq(eventsTable.distinctId, distinctId) : undefined,
          userId ? eq(eventsTable.userId, userId) : undefined,
          search
            ? (() => {
                const pattern = `%${escapeLike(search)}%`;
                return sql`${eventsTable.name} LIKE ${pattern} ESCAPE '\\'`;
              })()
            : undefined,
          startTsFilter(eventsTable.ts, startTs),
          endTsFilter(eventsTable.ts, endTs),
          cursorFilter(eventsTable.id, cursor, order)
        )
      )
      .orderBy(order === 'asc' ? asc(eventsTable.id) : desc(eventsTable.id))
      .limit(limit + 1)
      .all();

    const hasMore = rows.length > limit;
    const resultRows = hasMore ? rows.slice(0, limit) : rows;

    return {
      events: resultRows.map(mapRowToStoredEvent),
      nextCursor: hasMore ? (resultRows.at(-1)?.id ?? null) : null,
    };
  }

  clear(params: Partial<EventQueryParams> = {}): number {
    if (!this.db) {
      return 0;
    }

    const { name, source, pluginName, startTs, endTs } = params;

    const deleted = this.db
      .delete(eventsTable)
      .where(
        and(
          oneOrMany(eventsTable.name, name),
          oneOrMany(eventsTable.source, source),
          pluginName ? eq(eventsTable.pluginName, pluginName) : undefined,
          startTsFilter(eventsTable.ts, startTs),
          endTsFilter(eventsTable.ts, endTs)
        )
      )
      .returning({ id: eventsTable.id })
      .all();

    return deleted.length;
  }

  /**
   * Event counts bucketed into fixed-width time windows (`bucketMs`), oldest
   * first, the data behind the "events over time" chart. Honours the same
   * filters as {@link query} (name/source/pluginName/time range).
   */
  timeSeries(bucketMs: number, params: EventQueryParams = {}): TimeBucket[] {
    if (!this.db || bucketMs <= 0) {
      return [];
    }
    const { name, source, pluginName, startTs, endTs } = params;
    const bucketExpr = sql<number>`(${eventsTable.ts} / ${bucketMs}) * ${bucketMs}`;

    return this.db
      .select({ bucket: bucketExpr, count: count() })
      .from(eventsTable)
      .where(
        and(
          oneOrMany(eventsTable.name, name),
          oneOrMany(eventsTable.source, source),
          pluginName ? eq(eventsTable.pluginName, pluginName) : undefined,
          startTsFilter(eventsTable.ts, startTs),
          endTsFilter(eventsTable.ts, endTs)
        )
      )
      .groupBy(bucketExpr)
      .orderBy(asc(bucketExpr))
      .all()
      .map((row) => ({ bucket: Number(row.bucket), count: Number(row.count) }));
  }

  /** Distinct event names with their occurrence counts, most frequent first. */
  topNames(limit = 50): EventNameCount[] {
    if (!this.db) {
      return [];
    }
    return this.db
      .select({ name: eventsTable.name, count: count() })
      .from(eventsTable)
      .groupBy(eventsTable.name)
      .orderBy(desc(count()))
      .limit(Math.min(limit, 500))
      .all()
      .map((row) => ({ name: row.name, count: Number(row.count) }));
  }

  /** Event counts grouped by source (ui/plugin/hub/cli), most frequent first. */
  topSources(): SourceCount[] {
    if (!this.db) {
      return [];
    }
    return this.db
      .select({ source: eventsTable.source, count: count() })
      .from(eventsTable)
      .groupBy(eventsTable.source)
      .orderBy(desc(count()))
      .all()
      .flatMap((row) =>
        isCaptureSource(row.source) ? [{ source: row.source, count: Number(row.count) }] : []
      );
  }

  /** Event counts grouped by originating plugin, most frequent first. */
  topPlugins(limit = 20): PluginCount[] {
    if (!this.db) {
      return [];
    }
    return this.db
      .select({ pluginName: eventsTable.pluginName, count: count() })
      .from(eventsTable)
      .where(isNotNull(eventsTable.pluginName))
      .groupBy(eventsTable.pluginName)
      .orderBy(desc(count()))
      .limit(Math.min(limit, 200))
      .all()
      .flatMap((row) =>
        row.pluginName === null ? [] : [{ pluginName: row.pluginName, count: Number(row.count) }]
      );
  }

  getPluginNames(): string[] {
    if (!this.db) {
      return [];
    }
    return this.db
      .selectDistinct({ pluginName: eventsTable.pluginName })
      .from(eventsTable)
      .where(isNotNull(eventsTable.pluginName))
      .orderBy(asc(eventsTable.pluginName))
      .all()
      .map((r) => r.pluginName as string);
  }

  count(): number {
    if (!this.db) {
      return 0;
    }
    return this.db.select({ value: count() }).from(eventsTable).get()?.value ?? 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Row → StoredCaptureEvent mapping
// ─────────────────────────────────────────────────────────────────────────────

type EventRow = typeof eventsTable.$inferSelect;

function mapRowToStoredEvent(row: EventRow): StoredCaptureEvent {
  const event: StoredCaptureEvent = {
    id: row.id,
    ts: row.ts,
    name: row.name,
    source: row.source as CaptureSource,
    distinctId: row.distinctId ?? undefined,
    userId: row.userId ?? undefined,
    pluginName: row.pluginName ?? undefined,
    props: row.props ? (JSON.parse(row.props) as Record<string, Json>) : undefined,
  };
  return event;
}
