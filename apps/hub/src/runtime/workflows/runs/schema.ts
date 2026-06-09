import { index, integer, sqliteTable, text } from '@brika/db';

/**
 * A workflow run: a best-effort causal slice of the always-on event stream,
 * keyed by a hub-minted correlationId. Opened by a trigger/source/inject
 * emission, closed by a quiescence window or workflow stop.
 */
export const runs = sqliteTable(
  'runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    workflowId: text('workflow_id').notNull(),
    correlationId: text('correlation_id').notNull(),
    status: text('status', { enum: ['running', 'completed', 'error'] }).notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    error: text('error'),
    triggerBlockId: text('trigger_block_id'),
    eventCount: integer('event_count').notNull(),
  },
  (table) => [
    index('idx_runs_workflow').on(table.workflowId),
    index('idx_runs_correlation').on(table.correlationId),
    index('idx_runs_started').on(table.startedAt),
    index('idx_runs_status').on(table.status),
  ]
);

/**
 * A single event within a run (block.start, block.emit, block.log, block.error).
 * `causationId` is reserved for true per-event causation (null today); it lets a
 * future invasive IPC pass backfill causality without a schema migration.
 */
export const runEvents = sqliteTable(
  'run_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: integer('run_id').notNull(),
    ts: integer('ts').notNull(),
    kind: text('kind').notNull(),
    blockId: text('block_id'),
    port: text('port'),
    data: text('data'),
    level: text('level'),
    message: text('message'),
    causationId: text('causation_id'),
  },
  (table) => [
    index('idx_run_events_run').on(table.runId),
    index('idx_run_events_run_ts').on(table.runId, table.ts),
  ]
);
