import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import type { Json } from '@/types';
import type { LogEvent, LogLevel, LogSource } from '@/runtime/logs/types';
import pc from 'picocolors';
import { defineCommand } from '../command';
import { CliError } from '../errors';
import { hubFetch, requireRunningHub } from '../utils/hub-client';
import { streamSseEvents } from '../utils/sse';
import { TerminalFormatter } from '@/runtime/logs/formatters/terminal-formatter';

const fmt = new TerminalFormatter({ color: process.stdout.isTTY ?? false });
const DB_PATH = join(process.cwd(), '.brika', 'logs.db');

interface Filters {
  level?: LogLevel;
  source?: LogSource;
  plugin?: string;
  search?: string;
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

function openDb(): Database {
  try {
    return new Database(DB_PATH, { readonly: true });
  } catch {
    throw new CliError(`${pc.red('No log database found.')} Is this a Brika project directory?`);
  }
}

function rowToEvent(r: LogRow): LogEvent {
  const event: LogEvent = {
    ts: r.ts,
    level: r.level as LogLevel,
    source: r.source as LogSource,
    pluginName: r.plugin_name ?? undefined,
    message: r.message,
    meta: r.meta ? (JSON.parse(r.meta) as Record<string, Json>) : undefined,
  };
  if (r.error_name || r.error_message) {
    event.error = {
      name: r.error_name ?? 'Error',
      message: r.error_message ?? '',
      stack: r.error_stack ?? undefined,
      cause: r.error_cause ?? undefined,
    };
  }
  return event;
}

function queryDb(filters: Filters, limit: number): LogEvent[] {
  const db = openDb();
  const conds: string[] = [];
  const vals: (string | number)[] = [];

  if (filters.level) {
    conds.push('level = ?');
    vals.push(filters.level);
  }
  if (filters.source) {
    conds.push('source = ?');
    vals.push(filters.source);
  }
  if (filters.plugin) {
    conds.push('plugin_name = ?');
    vals.push(filters.plugin);
  }
  if (filters.search) {
    conds.push('message LIKE ?');
    vals.push(`%${filters.search}%`);
  }

  const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = db
    .query(
      `SELECT id, ts, level, source, plugin_name, message, meta,
              error_name, error_message, error_stack, error_cause
       FROM logs ${where} ORDER BY id DESC LIMIT ?`,
    )
    .all(...vals, limit) as LogRow[];

  db.close();
  return rows.toReversed().map(rowToEvent);
}

function clearDb(): number {
  const db = new Database(DB_PATH);
  const result = db.run('DELETE FROM logs');
  db.close();
  return result.changes;
}

function matchesFilters(event: LogEvent, filters: Filters): boolean {
  if (filters.level && event.level !== filters.level) return false;
  if (filters.source && event.source !== filters.source) return false;
  if (filters.plugin && event.pluginName !== filters.plugin) return false;
  if (filters.search && !event.message.toLowerCase().includes(filters.search.toLowerCase())) {
    return false;
  }
  return true;
}

async function followLogs(filters: Filters, limit: number): Promise<void> {
  // Print recent logs from DB first
  for (const log of queryDb(filters, limit)) {
    console.log(fmt.format(log));
  }

  // SSE requires the hub to be running
  await requireRunningHub();
  console.log(pc.dim('--- live tail ---'));

  const res = await hubFetch('/api/stream/logs');

  const abort = () => process.exit(0);
  process.on('SIGINT', abort);
  process.on('SIGTERM', abort);

  for await (const event of streamSseEvents<LogEvent>(res)) {
    if (matchesFilters(event, filters)) console.log(fmt.format(event));
  }
}

export default defineCommand({
  name: 'log',
  description: 'Show and search application logs',
  details: [
    'Query and search historical logs directly from the database.',
    'Use -f to tail live logs via SSE (requires the hub to be running).',
  ].join('\n'),
  options: {
    follow: { type: 'boolean', short: 'f', description: 'Live tail (Ctrl+C to stop)' },
    level: { type: 'string', short: 'l', description: 'Filter by level (debug|info|warn|error)' },
    source: { type: 'string', short: 's', description: 'Filter by source (hub|plugin|…)' },
    plugin: { type: 'string', short: 'p', description: 'Filter by plugin name' },
    search: { type: 'string', short: 'q', description: 'Search text in messages' },
    limit: { type: 'number', short: 'n', default: 50, description: 'Number of logs to show' },
    clear: { type: 'boolean', description: 'Clear all stored logs' },
  },
  examples: [
    'brika log',
    'brika log -f',
    'brika log --level error',
    'brika log --search "timeout" -n 100',
    'brika log -f --level warn --plugin timer',
    'brika log --clear',
  ],
  async handler({ values }) {
    // values.level is string | undefined, values.follow is boolean | undefined
    const filters: Filters = {
      level: values.level as LogLevel | undefined,
      source: values.source as LogSource | undefined,
      plugin: values.plugin,
      search: values.search,
    };
    // values.limit is number (guaranteed by default: 50)
    const limit = values.limit;

    if (values.clear) {
      const deleted = clearDb();
      console.log(`${pc.green('Cleared')} ${deleted} log${deleted === 1 ? '' : 's'}`);
      return;
    }

    if (values.follow) {
      await followLogs(filters, limit);
      return;
    }

    const logs = queryDb(filters, limit);
    if (logs.length === 0) {
      console.log(pc.dim('No logs found.'));
      return;
    }
    for (const log of logs) console.log(fmt.format(log));
  },
});
