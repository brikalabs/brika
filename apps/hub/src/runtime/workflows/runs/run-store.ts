import {
  and,
  asc,
  type BrikaDatabase,
  cursorFilter,
  desc,
  endTsFilter,
  eq,
  inArray,
  incrementalVacuum,
  lt,
  or,
  sql,
  startTsFilter,
} from '@brika/db';
import { inject, singleton } from '@brika/di';
import { Logger } from '@/runtime/logs/log-router';
import type { Json } from '@/types';
import type { ExecutionEvent } from '../workflow-executor';
import { workflowsDb } from './database';
import { runEvents as runEventsTable, runs as runsTable } from './schema';

type RunsSchema = { runs: typeof runsTable; runEvents: typeof runEventsTable };
type RunsDb = BrikaDatabase<RunsSchema>['db'];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type RunStatus = 'running' | 'completed' | 'error';

/** A run summary, shaped to match the UI `WorkflowRun` contract. */
export interface WorkflowRunSummary {
  id: string;
  workflowId: string;
  status: RunStatus;
  startedAt: number;
  finishedAt?: number;
  error?: string;
  triggerBlockId?: string;
  eventCount: number;
}

export interface WorkflowRunEvent {
  id: number;
  ts: number;
  kind: string;
  blockId?: string;
  port?: string;
  data?: Json;
  level?: string;
  message?: string;
  causationId?: string;
}

export interface WorkflowRunDetail {
  run: WorkflowRunSummary;
  events: WorkflowRunEvent[];
}

export interface RunQueryParams {
  workflowId?: string;
  status?: RunStatus;
  startTs?: number;
  endTs?: number;
  cursor?: number;
  limit?: number;
  order?: 'asc' | 'desc';
}

export interface RunQueryResult {
  runs: WorkflowRunSummary[];
  nextCursor: number | null;
}

/** Largest serialized event payload kept verbatim; larger ones store a marker. */
const MAX_EVENT_DATA_BYTES = 8192;

// ─────────────────────────────────────────────────────────────────────────────
// Run Store Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persists workflow runs and their events to `workflows.db`.
 *
 * Driven by the global ExecutionEvent stream (see the `workflow-runs` bootstrap
 * plugin). Each `run.opened` opens a row; subsequent run-scoped events append to
 * it; `run.closed` (or a workflow stop) finalizes it. Persistence never crashes
 * the engine: a write failure disables the store and logs once.
 */
@singleton()
export class RunStore {
  readonly #logs = inject(Logger).withSource('workflow');
  #database: BrikaDatabase<RunsSchema> | null = null;
  /** `${workflowId}:${correlationId}` -> open run id. */
  readonly #openRunIds = new Map<string, number>();
  #disabled = false;
  #pruneTimer?: ReturnType<typeof setInterval>;

  init(): void {
    this.#database = workflowsDb.open();
  }

  /**
   * Start a periodic sweep dropping runs (and their events) older than
   * `retentionDays`, freed pages reclaimed after each sweep. `retentionDays = 0`
   * disables it. Idempotent; runs once immediately so a stale DB shrinks at boot.
   */
  startRetention(retentionDays: number, intervalMs: number): void {
    this.stopRetention();
    if (retentionDays <= 0 || intervalMs <= 0) {
      return;
    }
    const sweep = () => {
      this.pruneOlderThan(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    };
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
   * Delete runs with `startedAt < cutoff` and their `run_events` (no FK cascade,
   * so both tables are pruned in one transaction), then reclaim the freed pages.
   * Returns the number of runs removed. Failures are swallowed so a transient
   * I/O error never crashes the retention timer.
   */
  pruneOlderThan(cutoff: number): number {
    const db = this.db;
    if (!db || !this.#database) {
      return 0;
    }
    try {
      const removed = this.#database.sqlite.transaction(() => {
        const oldRuns = db
          .delete(runsTable)
          .where(lt(runsTable.startedAt, cutoff))
          .returning({ id: runsTable.id })
          .all();
        if (oldRuns.length > 0) {
          db.delete(runEventsTable)
            .where(
              inArray(
                runEventsTable.runId,
                oldRuns.map((r) => r.id)
              )
            )
            .run();
        }
        return oldRuns.length;
      })();
      if (removed > 0) {
        try {
          incrementalVacuum(this.#database.sqlite);
        } catch {
          // Best-effort: a failed reclaim leaves the freed pages for next time.
        }
      }
      return removed;
    } catch {
      return 0;
    }
  }

  private get db(): RunsDb | null {
    return this.#database?.db ?? null;
  }

  /** Translate one ExecutionEvent into run/run_event rows. */
  record(event: ExecutionEvent): void {
    if (this.#disabled) {
      return;
    }
    const db = this.db;
    if (!db) {
      return;
    }

    try {
      this.#record(db, event);
    } catch (e) {
      this.#disabled = true;
      this.#logs.error('Run persistence failed, disabling for this session', {}, { error: e });
    }
  }

  #record(db: RunsDb, event: ExecutionEvent): void {
    switch (event.type) {
      case 'workflow.started':
        return;
      case 'run.opened':
        this.#openRunRow(db, event);
        return;
      case 'run.closed':
        this.#closeRunRow(db, event);
        return;
      case 'workflow.stopped':
        this.#closeWorkflowRuns(db, event.workflowId);
        return;
      default:
        // Run-scoped events: block.start | block.emit | block.log | block.error.
        this.#recordRunEvent(db, event);
    }
  }

  #openRunRow(db: RunsDb, event: ExecutionEvent): void {
    if (!event.correlationId) {
      return;
    }
    const id = this.#insertRun(db, event);
    if (id !== null) {
      this.#openRunIds.set(runKey(event.workflowId, event.correlationId), id);
    }
  }

  #closeRunRow(db: RunsDb, event: ExecutionEvent): void {
    if (!event.correlationId) {
      return;
    }
    const key = runKey(event.workflowId, event.correlationId);
    const runId = this.#openRunIds.get(key);
    this.#openRunIds.delete(key);
    if (runId !== undefined) {
      this.#finalizeRun(db, runId);
    }
  }

  /** Defensive: finalize any runs still open for a stopping workflow. */
  #closeWorkflowRuns(db: RunsDb, workflowId: string): void {
    const prefix = `${workflowId}:`;
    for (const [key, runId] of this.#openRunIds) {
      if (key.startsWith(prefix)) {
        this.#openRunIds.delete(key);
        this.#finalizeRun(db, runId);
      }
    }
  }

  #recordRunEvent(db: RunsDb, event: ExecutionEvent): void {
    if (!event.correlationId) {
      return; // pre-run / startup events are not grouped into a run
    }
    const runId = this.#resolveRunId(db, event);
    if (runId === null) {
      return;
    }

    db.insert(runEventsTable)
      .values({
        runId,
        ts: Date.now(),
        kind: event.type,
        blockId: event.blockId ?? null,
        port: event.port ?? null,
        data: serializeEventData(event.data),
        level: event.level ?? null,
        message: event.message ?? null,
        causationId: null,
      })
      .run();

    db.update(runsTable)
      .set({ eventCount: sql`${runsTable.eventCount} + 1` })
      .where(eq(runsTable.id, runId))
      .run();

    if (event.type === 'block.error') {
      db.update(runsTable)
        .set({ status: 'error', error: event.error ?? null })
        .where(and(eq(runsTable.id, runId), eq(runsTable.status, 'running')))
        .run();
    }
  }

  #insertRun(db: RunsDb, event: ExecutionEvent): number | null {
    if (!event.correlationId) {
      return null;
    }
    const inserted = db
      .insert(runsTable)
      .values({
        workflowId: event.workflowId,
        correlationId: event.correlationId,
        status: 'running',
        startedAt: Date.now(),
        triggerBlockId: event.blockId ?? null,
        eventCount: 0,
      })
      .returning({ id: runsTable.id })
      .get();
    return inserted?.id ?? null;
  }

  /** Resolve the open run for an event, lazily opening one if it arrived first. */
  #resolveRunId(db: RunsDb, event: ExecutionEvent): number | null {
    if (!event.correlationId) {
      return null;
    }
    const key = runKey(event.workflowId, event.correlationId);
    const existing = this.#openRunIds.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const id = this.#insertRun(db, event);
    if (id !== null) {
      this.#openRunIds.set(key, id);
    }
    return id;
  }

  /** Set ended_at, and complete the run if it never errored. */
  #finalizeRun(db: RunsDb, runId: number): void {
    db.update(runsTable).set({ endedAt: Date.now() }).where(eq(runsTable.id, runId)).run();
    db.update(runsTable)
      .set({ status: 'completed' })
      .where(and(eq(runsTable.id, runId), eq(runsTable.status, 'running')))
      .run();
  }

  /**
   * Values previously emitted by the given (blockId, port) sources in a
   * workflow, newest first, deduplicated by payload. Backs the editor's
   * "run with a previous input" list: the sources are the ports wired into
   * the input being re-triggered. Truncation markers (payloads over the
   * per-event cap) are skipped because they cannot be replayed faithfully.
   */
  recentEmittedValues(
    workflowId: string,
    refs: ReadonlyArray<{ blockId: string; port: string }>,
    limit = 10
  ): Array<{ ts: number; value: Json }> {
    if (refs.length === 0) {
      return [];
    }
    const db = this.db;
    if (!db) {
      return [];
    }
    const refMatch = or(
      ...refs.map((ref) =>
        and(eq(runEventsTable.blockId, ref.blockId), eq(runEventsTable.port, ref.port))
      )
    );
    const rows = db
      .select({ ts: runEventsTable.ts, data: runEventsTable.data })
      .from(runEventsTable)
      .innerJoin(runsTable, eq(runsTable.id, runEventsTable.runId))
      .where(
        and(eq(runsTable.workflowId, workflowId), eq(runEventsTable.kind, 'block.emit'), refMatch)
      )
      // id breaks same-millisecond ts ties in insertion order
      .orderBy(desc(runEventsTable.ts), desc(runEventsTable.id))
      .limit(Math.min(Math.max(limit, 1), 50) * 5)
      .all();

    const seen = new Set<string>();
    const out: Array<{ ts: number; value: Json }> = [];
    for (const row of rows) {
      if (row.data === null || seen.has(row.data)) {
        continue;
      }
      const value = parseJson(row.data);
      if (typeof value === 'object' && value !== null && '__truncated' in value) {
        continue;
      }
      seen.add(row.data);
      out.push({ ts: row.ts, value });
      if (out.length >= limit) {
        break;
      }
    }
    return out;
  }

  query(params: RunQueryParams = {}): RunQueryResult {
    const db = this.db;
    if (!db) {
      return { runs: [], nextCursor: null };
    }

    const { workflowId, status, startTs, endTs, cursor } = params;
    const limit = Math.min(params.limit ?? 100, 1000);
    const order = params.order ?? 'desc';

    const rows = db
      .select()
      .from(runsTable)
      .where(
        and(
          workflowId ? eq(runsTable.workflowId, workflowId) : undefined,
          status ? eq(runsTable.status, status) : undefined,
          startTsFilter(runsTable.startedAt, startTs),
          endTsFilter(runsTable.startedAt, endTs),
          cursorFilter(runsTable.id, cursor, order)
        )
      )
      .orderBy(order === 'asc' ? asc(runsTable.id) : desc(runsTable.id))
      .limit(limit + 1)
      .all();

    const hasMore = rows.length > limit;
    const resultRows = hasMore ? rows.slice(0, limit) : rows;

    return {
      runs: resultRows.map(mapRowToSummary),
      nextCursor: hasMore ? (resultRows.at(-1)?.id ?? null) : null,
    };
  }

  get(runId: number): WorkflowRunDetail | null {
    const db = this.db;
    if (!db) {
      return null;
    }

    const row = db.select().from(runsTable).where(eq(runsTable.id, runId)).get();
    if (!row) {
      return null;
    }

    const events = db
      .select()
      .from(runEventsTable)
      .where(eq(runEventsTable.runId, runId))
      .orderBy(asc(runEventsTable.ts), asc(runEventsTable.id))
      .all();

    return { run: mapRowToSummary(row), events: events.map(mapRowToEvent) };
  }

  close(): void {
    this.stopRetention();
    this.#database?.sqlite.close();
    this.#database = null;
    this.#openRunIds.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function runKey(workflowId: string, correlationId: string): string {
  return `${workflowId}:${correlationId}`;
}

type RunRow = typeof runsTable.$inferSelect;
type RunEventRow = typeof runEventsTable.$inferSelect;

function mapRowToSummary(row: RunRow): WorkflowRunSummary {
  return {
    id: String(row.id),
    workflowId: row.workflowId,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.endedAt ?? undefined,
    error: row.error ?? undefined,
    triggerBlockId: row.triggerBlockId ?? undefined,
    eventCount: row.eventCount,
  };
}

function mapRowToEvent(row: RunEventRow): WorkflowRunEvent {
  return {
    id: row.id,
    ts: row.ts,
    kind: row.kind,
    blockId: row.blockId ?? undefined,
    port: row.port ?? undefined,
    data: row.data === null ? undefined : parseJson(row.data),
    level: row.level ?? undefined,
    message: row.message ?? undefined,
    causationId: row.causationId ?? undefined,
  };
}

/** JSON.parse typed to Json without a cast (its `any` result widens to Json). */
function parseJson(text: string): Json {
  return JSON.parse(text);
}

function serializeEventData(data: Json | undefined): string | null {
  if (data === undefined || data === null) {
    return null;
  }
  const json = JSON.stringify(data);
  if (json === undefined) {
    return null;
  }
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes > MAX_EVENT_DATA_BYTES) {
    return JSON.stringify({ __truncated: true, bytes });
  }
  return json;
}
