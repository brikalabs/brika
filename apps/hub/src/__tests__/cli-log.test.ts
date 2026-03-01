/**
 * Tests for the log CLI command (cli/commands/log.ts)
 *
 * Covers: command metadata, handler paths (query, clear, empty, follow),
 * rowToEvent conversion, queryDb query building, clearDb, matchesFilters,
 * and error paths (missing database).
 *
 * Internal helpers (rowToEvent, queryDb, clearDb, matchesFilters) are tested
 * indirectly through the exported handler or via replicated logic where the
 * handler path would require complex mocking (SSE streaming).
 */

import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { existsSync, mkdirSync, renameSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { LogEvent, LogLevel, LogSource } from '@/runtime/logs/types';
import type { Json } from '@/types';
import { captureLog } from './helpers/capture';

// ─── Resolve the DB path the module will use ────────────────────────────────
// In dev/test mode: join(process.cwd(), '.brika', 'logs.db')
const DATA_DIR = join(process.cwd(), '.brika');
const DB_PATH = join(DATA_DIR, 'logs.db');

// ─── Replicated pure helpers (not exported from source) ─────────────────────
// Mirrors cli/commands/log.ts so we can unit-test without mock.module().

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

interface Filters {
  level?: LogLevel;
  source?: LogSource;
  plugin?: string;
  search?: string;
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

function matchesFilters(event: LogEvent, filters: Filters): boolean {
  if (filters.level && event.level !== filters.level) {
    return false;
  }
  if (filters.source && event.source !== filters.source) {
    return false;
  }
  if (filters.plugin && event.pluginName !== filters.plugin) {
    return false;
  }
  if (filters.search && !event.message.toLowerCase().includes(filters.search.toLowerCase())) {
    return false;
  }
  return true;
}

// ─── DB helpers for handler integration tests ───────────────────────────────

/** Create a fresh logs table matching the schema the log command expects. */
function createTestDb(path: string): Database {
  const db = new Database(path);
  db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      ts            INTEGER NOT NULL,
      level         TEXT    NOT NULL,
      source        TEXT    NOT NULL,
      plugin_name   TEXT,
      message       TEXT    NOT NULL,
      meta          TEXT,
      error_name    TEXT,
      error_message TEXT,
      error_stack   TEXT,
      error_cause   TEXT
    )
  `);
  return db;
}

function insertRow(
  db: Database,
  row: Partial<LogRow> & {
    ts: number;
    message: string;
  }
): void {
  db.run(
    `INSERT INTO logs (ts, level, source, plugin_name, message, meta,
       error_name, error_message, error_stack, error_cause)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.ts,
      row.level ?? 'info',
      row.source ?? 'hub',
      row.plugin_name ?? null,
      row.message,
      row.meta ?? null,
      row.error_name ?? null,
      row.error_message ?? null,
      row.error_stack ?? null,
      row.error_cause ?? null,
    ]
  );
}

// ─── Import the command (triggers DB_PATH computation at module load) ────────
import logCommand from '@/cli/commands/log';

// ─── Command metadata ───────────────────────────────────────────────────────

describe('cli/commands/log', () => {
  describe('metadata', () => {
    test('name is "log"', () => {
      expect(logCommand.name).toBe('log');
    });

    test('has a description', () => {
      expect(logCommand.description).toBe('Show and search application logs');
    });

    test('has details text', () => {
      expect(logCommand.details).toBeDefined();
      expect(logCommand.details).toContain('database');
      expect(logCommand.details).toContain('SSE');
    });

    test('has handler function', () => {
      expect(typeof logCommand.handler).toBe('function');
    });

    test('has expected options', () => {
      const opts = logCommand.options;
      expect(opts).toBeDefined();

      expect(opts?.follow).toMatchObject({
        type: 'boolean',
        short: 'f',
      });
      expect(opts?.level).toMatchObject({
        type: 'string',
        short: 'l',
      });
      expect(opts?.source).toMatchObject({
        type: 'string',
        short: 's',
      });
      expect(opts?.plugin).toMatchObject({
        type: 'string',
        short: 'p',
      });
      expect(opts?.search).toMatchObject({
        type: 'string',
        short: 'q',
      });
      expect(opts?.limit).toMatchObject({
        type: 'number',
        short: 'n',
        default: 50,
      });
      expect(opts?.clear).toMatchObject({
        type: 'boolean',
      });
    });

    test('has examples array', () => {
      expect(logCommand.examples).toBeDefined();
      expect(logCommand.examples?.length).toBeGreaterThan(0);
    });

    test('examples include common usage patterns', () => {
      const examples = logCommand.examples ?? [];
      expect(examples).toContain('brika log');
      expect(examples).toContain('brika log -f');
      expect(examples).toContain('brika log --level error');
      expect(examples).toContain('brika log --clear');
    });

    test('option descriptions are defined', () => {
      const opts = logCommand.options;
      expect(opts?.follow?.description).toBeDefined();
      expect(opts?.level?.description).toBeDefined();
      expect(opts?.source?.description).toBeDefined();
      expect(opts?.plugin?.description).toBeDefined();
      expect(opts?.search?.description).toBeDefined();
      expect(opts?.limit?.description).toBeDefined();
      expect(opts?.clear?.description).toBeDefined();
    });
  });

  // ─── Handler integration tests (require real SQLite at DB_PATH) ───────────

  describe('handler', () => {
    let backupPath: string | undefined;
    let log: ReturnType<typeof captureLog>;

    beforeEach(() => {
      // Back up any existing logs.db to avoid corrupting dev data
      if (existsSync(DB_PATH)) {
        backupPath = `${DB_PATH}.test-backup`;
        renameSync(DB_PATH, backupPath);
      }

      // Ensure .brika directory exists
      mkdirSync(DATA_DIR, {
        recursive: true,
      });

      log = captureLog();
    });

    afterEach(() => {
      log.restore();

      // Remove test database
      try {
        unlinkSync(DB_PATH);
      } catch {
        // may not exist
      }
      // Also remove WAL/SHM files that SQLite may create
      try {
        unlinkSync(`${DB_PATH}-wal`);
      } catch {}
      try {
        unlinkSync(`${DB_PATH}-shm`);
      } catch {}

      // Restore original database
      if (backupPath && existsSync(backupPath)) {
        renameSync(backupPath, DB_PATH);
        backupPath = undefined;
      }
    });

    describe('query mode (default)', () => {
      test('prints "No logs found." when database is empty', async () => {
        const db = createTestDb(DB_PATH);
        db.close();

        await logCommand.handler({
          values: {
            limit: 50,
          },
          positionals: [],
          commands: [],
        });

        const output = log.lines.join('\n');
        expect(output).toContain('No logs found');
      });

      test('prints log events from database', async () => {
        const db = createTestDb(DB_PATH);
        insertRow(db, {
          ts: 1700000000000,
          message: 'Hello from test',
          level: 'info',
          source: 'hub',
        });
        db.close();

        await logCommand.handler({
          values: {
            limit: 50,
          },
          positionals: [],
          commands: [],
        });

        expect(log.lines.length).toBeGreaterThan(0);
        const output = log.lines.join('\n');
        expect(output).toContain('Hello from test');
      });

      test('respects limit option', async () => {
        const db = createTestDb(DB_PATH);
        for (let i = 0; i < 10; i++) {
          insertRow(db, {
            ts: 1700000000000 + i,
            message: `Log entry ${i}`,
          });
        }
        db.close();

        await logCommand.handler({
          values: {
            limit: 3,
          },
          positionals: [],
          commands: [],
        });

        // Should print exactly 3 log lines
        expect(log.lines.length).toBe(3);
      });

      test('filters by level', async () => {
        const db = createTestDb(DB_PATH);
        insertRow(db, {
          ts: 1000,
          message: 'Info msg',
          level: 'info',
        });
        insertRow(db, {
          ts: 2000,
          message: 'Error msg',
          level: 'error',
        });
        insertRow(db, {
          ts: 3000,
          message: 'Warn msg',
          level: 'warn',
        });
        db.close();

        await logCommand.handler({
          values: {
            level: 'error',
            limit: 50,
          },
          positionals: [],
          commands: [],
        });

        expect(log.lines.length).toBe(1);
        expect(log.lines[0]).toContain('Error msg');
      });

      test('filters by source', async () => {
        const db = createTestDb(DB_PATH);
        insertRow(db, {
          ts: 1000,
          message: 'Hub log',
          source: 'hub',
        });
        insertRow(db, {
          ts: 2000,
          message: 'Plugin log',
          source: 'plugin',
        });
        db.close();

        await logCommand.handler({
          values: {
            source: 'plugin',
            limit: 50,
          },
          positionals: [],
          commands: [],
        });

        expect(log.lines.length).toBe(1);
        expect(log.lines[0]).toContain('Plugin log');
      });

      test('filters by plugin name', async () => {
        const db = createTestDb(DB_PATH);
        insertRow(db, {
          ts: 1000,
          message: 'Timer tick',
          plugin_name: 'timer',
          source: 'plugin',
        });
        insertRow(db, {
          ts: 2000,
          message: 'Weather fetch',
          plugin_name: 'weather',
          source: 'plugin',
        });
        db.close();

        await logCommand.handler({
          values: {
            plugin: 'timer',
            limit: 50,
          },
          positionals: [],
          commands: [],
        });

        expect(log.lines.length).toBe(1);
        expect(log.lines[0]).toContain('Timer tick');
      });

      test('filters by search text', async () => {
        const db = createTestDb(DB_PATH);
        insertRow(db, {
          ts: 1000,
          message: 'Connection established',
        });
        insertRow(db, {
          ts: 2000,
          message: 'Connection timeout',
        });
        insertRow(db, {
          ts: 3000,
          message: 'Server ready',
        });
        db.close();

        await logCommand.handler({
          values: {
            search: 'timeout',
            limit: 50,
          },
          positionals: [],
          commands: [],
        });

        expect(log.lines.length).toBe(1);
        expect(log.lines[0]).toContain('Connection timeout');
      });

      test('combines multiple filters', async () => {
        const db = createTestDb(DB_PATH);
        insertRow(db, {
          ts: 1000,
          message: 'Plugin error timeout',
          level: 'error',
          source: 'plugin',
          plugin_name: 'timer',
        });
        insertRow(db, {
          ts: 2000,
          message: 'Hub error timeout',
          level: 'error',
          source: 'hub',
        });
        insertRow(db, {
          ts: 3000,
          message: 'Plugin info',
          level: 'info',
          source: 'plugin',
          plugin_name: 'timer',
        });
        db.close();

        await logCommand.handler({
          values: {
            level: 'error',
            source: 'plugin',
            plugin: 'timer',
            search: 'timeout',
            limit: 50,
          },
          positionals: [],
          commands: [],
        });

        expect(log.lines.length).toBe(1);
        expect(log.lines[0]).toContain('Plugin error timeout');
      });

      test('returns logs in chronological order (oldest first)', async () => {
        const db = createTestDb(DB_PATH);
        insertRow(db, {
          ts: 3000,
          message: 'Third',
        });
        insertRow(db, {
          ts: 1000,
          message: 'First',
        });
        insertRow(db, {
          ts: 2000,
          message: 'Second',
        });
        db.close();

        await logCommand.handler({
          values: {
            limit: 50,
          },
          positionals: [],
          commands: [],
        });

        // Logs should be in chronological order (the query does ORDER BY id DESC then toReversed())
        // Since they're inserted in order id=1(ts=3000), id=2(ts=1000), id=3(ts=2000),
        // ORDER BY id DESC gives [3,2,1], toReversed gives [1,2,3] = [ts=3000, ts=1000, ts=2000]
        expect(log.lines.length).toBe(3);
        expect(log.lines[0]).toContain('Third');
        expect(log.lines[1]).toContain('First');
        expect(log.lines[2]).toContain('Second');
      });

      test('handles rows with error fields', async () => {
        const db = createTestDb(DB_PATH);
        insertRow(db, {
          ts: 1000,
          message: 'Crash!',
          level: 'error',
          error_name: 'TypeError',
          error_message: 'undefined is not a function',
          error_stack: 'at foo.ts:10',
          error_cause: 'bad input',
        });
        db.close();

        await logCommand.handler({
          values: {
            limit: 50,
          },
          positionals: [],
          commands: [],
        });

        expect(log.lines.length).toBe(1);
        expect(log.lines[0]).toContain('Crash!');
      });

      test('handles rows with JSON metadata', async () => {
        const db = createTestDb(DB_PATH);
        insertRow(db, {
          ts: 1000,
          message: 'With meta',
          meta: JSON.stringify({
            key: 'value',
            count: 42,
          }),
        });
        db.close();

        await logCommand.handler({
          values: {
            limit: 50,
          },
          positionals: [],
          commands: [],
        });

        expect(log.lines.length).toBe(1);
        const output = log.lines[0];
        expect(output).toContain('With meta');
      });
    });

    describe('--clear mode', () => {
      test('clears logs and prints count', async () => {
        const db = createTestDb(DB_PATH);
        insertRow(db, {
          ts: 1000,
          message: 'Log 1',
        });
        insertRow(db, {
          ts: 2000,
          message: 'Log 2',
        });
        insertRow(db, {
          ts: 3000,
          message: 'Log 3',
        });
        db.close();

        await logCommand.handler({
          values: {
            clear: true,
            limit: 50,
          },
          positionals: [],
          commands: [],
        });

        const output = log.lines.join('\n');
        expect(output).toContain('Cleared');
        expect(output).toContain('3');
        expect(output).toContain('logs');

        // Verify database is actually empty
        const verifyDb = new Database(DB_PATH, {
          readonly: true,
        });
        const count = verifyDb.query('SELECT COUNT(*) as cnt FROM logs').get() as {
          cnt: number;
        };
        expect(count.cnt).toBe(0);
        verifyDb.close();
      });

      test('prints singular "log" for single entry', async () => {
        const db = createTestDb(DB_PATH);
        insertRow(db, {
          ts: 1000,
          message: 'Only one',
        });
        db.close();

        await logCommand.handler({
          values: {
            clear: true,
            limit: 50,
          },
          positionals: [],
          commands: [],
        });

        const output = log.lines.join('\n');
        expect(output).toContain('1 log');
        // Should not say "1 logs"
        expect(output).not.toMatch(/1 logs/);
      });

      test('prints "0 logs" when clearing empty table', async () => {
        const db = createTestDb(DB_PATH);
        db.close();

        await logCommand.handler({
          values: {
            clear: true,
            limit: 50,
          },
          positionals: [],
          commands: [],
        });

        const output = log.lines.join('\n');
        expect(output).toContain('Cleared');
        expect(output).toContain('0 logs');
      });

      test('clear takes priority over follow', async () => {
        // When both --clear and --follow are set, clear should execute and return
        const db = createTestDb(DB_PATH);
        insertRow(db, {
          ts: 1000,
          message: 'To be cleared',
        });
        db.close();

        await logCommand.handler({
          values: {
            clear: true,
            follow: true,
            limit: 50,
          },
          positionals: [],
          commands: [],
        });

        const output = log.lines.join('\n');
        expect(output).toContain('Cleared');
        expect(output).toContain('1 log');
      });
    });

    describe('error paths', () => {
      test('throws CliError when database file does not exist', async () => {
        // Ensure no database file exists
        try {
          unlinkSync(DB_PATH);
        } catch {}

        await expect(
          logCommand.handler({
            values: {
              limit: 50,
            },
            positionals: [],
            commands: [],
          })
        ).rejects.toThrow('No log database found');
      });

      test('CliError suggests checking project directory', async () => {
        try {
          unlinkSync(DB_PATH);
        } catch {}

        try {
          await logCommand.handler({
            values: {
              limit: 50,
            },
            positionals: [],
            commands: [],
          });
        } catch (e: unknown) {
          expect((e as Error).message).toContain('Brika project directory');
          expect((e as Error).name).toBe('CliError');
        }
      });

      test('clear throws when database does not exist', async () => {
        try {
          unlinkSync(DB_PATH);
        } catch {}

        // clearDb uses `new Database(DB_PATH)` without readonly, but the table
        // won't exist. The exact error depends on SQLite behavior.
        // The handler calls clearDb() which does `new Database(DB_PATH)` then
        // `db.run('DELETE FROM logs')` - this may throw if the file doesn't have
        // the logs table. Let's test for some kind of error.
        await expect(
          logCommand.handler({
            values: {
              clear: true,
              limit: 50,
            },
            positionals: [],
            commands: [],
          })
        ).rejects.toThrow();
      });
    });
  });

  // ─── Replicated rowToEvent tests ──────────────────────────────────────────

  describe('rowToEvent (replicated)', () => {
    const baseRow: LogRow = {
      id: 1,
      ts: 1700000000000,
      level: 'info',
      source: 'hub',
      plugin_name: null,
      message: 'Server started',
      meta: null,
      error_name: null,
      error_message: null,
      error_stack: null,
      error_cause: null,
    };

    test('converts a minimal row to LogEvent', () => {
      const event = rowToEvent(baseRow);

      expect(event.ts).toBe(1700000000000);
      expect(event.level).toBe('info');
      expect(event.source).toBe('hub');
      expect(event.message).toBe('Server started');
      expect(event.pluginName).toBeUndefined();
      expect(event.meta).toBeUndefined();
      expect(event.error).toBeUndefined();
    });

    test('maps plugin_name to pluginName', () => {
      const event = rowToEvent({
        ...baseRow,
        plugin_name: '@brika/timer',
      });
      expect(event.pluginName).toBe('@brika/timer');
    });

    test('null plugin_name becomes undefined', () => {
      const event = rowToEvent(baseRow);
      expect(event.pluginName).toBeUndefined();
    });

    test('parses JSON meta', () => {
      const event = rowToEvent({
        ...baseRow,
        meta: '{"host":"localhost","port":3000}',
      });
      expect(event.meta).toEqual({
        host: 'localhost',
        port: 3000,
      });
    });

    test('null meta stays undefined', () => {
      expect(rowToEvent(baseRow).meta).toBeUndefined();
    });

    test('builds error when error_name is present', () => {
      const event = rowToEvent({
        ...baseRow,
        error_name: 'RangeError',
        error_message: 'out of bounds',
        error_stack: 'at line 5',
        error_cause: 'negative index',
      });

      expect(event.error).toEqual({
        name: 'RangeError',
        message: 'out of bounds',
        stack: 'at line 5',
        cause: 'negative index',
      });
    });

    test('builds error when only error_message is present', () => {
      const event = rowToEvent({
        ...baseRow,
        error_message: 'something broke',
      });

      expect(event.error).toEqual({
        name: 'Error',
        message: 'something broke',
        stack: undefined,
        cause: undefined,
      });
    });

    test('builds error when only error_name is present', () => {
      const event = rowToEvent({
        ...baseRow,
        error_name: 'CustomError',
      });

      expect(event.error).toEqual({
        name: 'CustomError',
        message: '',
        stack: undefined,
        cause: undefined,
      });
    });

    test('no error when both error_name and error_message are null', () => {
      expect(rowToEvent(baseRow).error).toBeUndefined();
    });

    test('error with stack but no cause', () => {
      const event = rowToEvent({
        ...baseRow,
        error_name: 'Err',
        error_message: 'msg',
        error_stack: 'stack trace here',
        error_cause: null,
      });

      expect(event.error?.stack).toBe('stack trace here');
      expect(event.error?.cause).toBeUndefined();
    });

    test('error with cause but no stack', () => {
      const event = rowToEvent({
        ...baseRow,
        error_name: 'Err',
        error_message: 'msg',
        error_stack: null,
        error_cause: 'the root cause',
      });

      expect(event.error?.stack).toBeUndefined();
      expect(event.error?.cause).toBe('the root cause');
    });

    test('handles deeply nested meta JSON', () => {
      const meta = {
        arr: [
          1,
          2,
          {
            nested: true,
          },
        ],
        obj: {
          a: {
            b: 'c',
          },
        },
      };
      const event = rowToEvent({
        ...baseRow,
        meta: JSON.stringify(meta),
      });
      expect(event.meta).toEqual(meta);
    });

    test('preserves all log levels', () => {
      for (const level of [
        'debug',
        'info',
        'warn',
        'error',
      ] as LogLevel[]) {
        expect(
          rowToEvent({
            ...baseRow,
            level,
          }).level
        ).toBe(level);
      }
    });

    test('preserves all log sources', () => {
      const sources: LogSource[] = [
        'hub',
        'plugin',
        'installer',
        'registry',
        'stderr',
        'workflow',
        'events',
        'http',
        'i18n',
        'state',
        'updates',
      ];
      for (const source of sources) {
        expect(
          rowToEvent({
            ...baseRow,
            source,
          }).source
        ).toBe(source);
      }
    });
  });

  // ─── Replicated matchesFilters tests ──────────────────────────────────────

  describe('matchesFilters (replicated)', () => {
    const baseEvent: LogEvent = {
      ts: 1700000000000,
      level: 'info',
      source: 'hub',
      message: 'Server started on port 3000',
    };

    test('returns true with empty filters', () => {
      expect(matchesFilters(baseEvent, {})).toBe(true);
    });

    test('matches by level', () => {
      expect(
        matchesFilters(baseEvent, {
          level: 'info',
        })
      ).toBe(true);
      expect(
        matchesFilters(baseEvent, {
          level: 'error',
        })
      ).toBe(false);
    });

    test('matches by source', () => {
      expect(
        matchesFilters(baseEvent, {
          source: 'hub',
        })
      ).toBe(true);
      expect(
        matchesFilters(baseEvent, {
          source: 'plugin',
        })
      ).toBe(false);
    });

    test('matches by plugin name', () => {
      const withPlugin: LogEvent = {
        ...baseEvent,
        pluginName: 'timer',
      };
      expect(
        matchesFilters(withPlugin, {
          plugin: 'timer',
        })
      ).toBe(true);
      expect(
        matchesFilters(withPlugin, {
          plugin: 'weather',
        })
      ).toBe(false);
    });

    test('rejects event without pluginName when plugin filter is set', () => {
      expect(
        matchesFilters(baseEvent, {
          plugin: 'timer',
        })
      ).toBe(false);
    });

    test('search is case-insensitive', () => {
      expect(
        matchesFilters(baseEvent, {
          search: 'server',
        })
      ).toBe(true);
      expect(
        matchesFilters(baseEvent, {
          search: 'SERVER',
        })
      ).toBe(true);
      expect(
        matchesFilters(baseEvent, {
          search: 'Server Started',
        })
      ).toBe(true);
    });

    test('search is substring match', () => {
      expect(
        matchesFilters(baseEvent, {
          search: 'port',
        })
      ).toBe(true);
      expect(
        matchesFilters(baseEvent, {
          search: '3000',
        })
      ).toBe(true);
    });

    test('search rejects non-matching text', () => {
      expect(
        matchesFilters(baseEvent, {
          search: 'shutdown',
        })
      ).toBe(false);
    });

    test('empty string search matches everything', () => {
      expect(
        matchesFilters(baseEvent, {
          search: '',
        })
      ).toBe(true);
    });

    test('combines multiple filters with AND logic', () => {
      const event: LogEvent = {
        ts: 1700000000000,
        level: 'error',
        source: 'plugin',
        pluginName: 'timer',
        message: 'Connection timeout',
      };

      expect(
        matchesFilters(event, {
          level: 'error',
          source: 'plugin',
          plugin: 'timer',
          search: 'timeout',
        })
      ).toBe(true);

      // Fail on level
      expect(
        matchesFilters(event, {
          level: 'info',
          source: 'plugin',
        })
      ).toBe(false);
      // Fail on source
      expect(
        matchesFilters(event, {
          level: 'error',
          source: 'hub',
        })
      ).toBe(false);
      // Fail on plugin
      expect(
        matchesFilters(event, {
          level: 'error',
          plugin: 'weather',
        })
      ).toBe(false);
      // Fail on search
      expect(
        matchesFilters(event, {
          level: 'error',
          search: 'missing',
        })
      ).toBe(false);
    });

    test('filters apply short-circuit on first mismatch', () => {
      // Level mismatch should reject immediately regardless of other filters
      expect(
        matchesFilters(baseEvent, {
          level: 'error',
          source: 'hub',
          search: 'Server',
        })
      ).toBe(false);
    });

    test('handles event with all optional fields', () => {
      const fullEvent: LogEvent = {
        ts: 1700000000000,
        level: 'warn',
        source: 'plugin',
        pluginName: 'weather',
        message: 'API rate limit',
        meta: {
          remaining: 5,
        },
        error: {
          name: 'RateLimitWarning',
          message: 'close to limit',
        },
      };

      expect(
        matchesFilters(fullEvent, {
          level: 'warn',
          source: 'plugin',
          plugin: 'weather',
          search: 'rate',
        })
      ).toBe(true);
    });
  });

  // ─── queryDb behavior (tested via handler) ────────────────────────────────

  describe('queryDb behavior (via handler)', () => {
    let backupPath: string | undefined;
    let log: ReturnType<typeof captureLog>;

    beforeEach(() => {
      if (existsSync(DB_PATH)) {
        backupPath = `${DB_PATH}.test-backup-q`;
        renameSync(DB_PATH, backupPath);
      }
      mkdirSync(DATA_DIR, {
        recursive: true,
      });
      log = captureLog();
    });

    afterEach(() => {
      log.restore();
      try {
        unlinkSync(DB_PATH);
      } catch {}
      try {
        unlinkSync(`${DB_PATH}-wal`);
      } catch {}
      try {
        unlinkSync(`${DB_PATH}-shm`);
      } catch {}
      if (backupPath && existsSync(backupPath)) {
        renameSync(backupPath, DB_PATH);
        backupPath = undefined;
      }
    });

    test('WHERE clause omitted when no filters provided', async () => {
      const db = createTestDb(DB_PATH);
      insertRow(db, {
        ts: 1000,
        message: 'A',
      });
      insertRow(db, {
        ts: 2000,
        message: 'B',
      });
      db.close();

      await logCommand.handler({
        values: {
          limit: 50,
        },
        positionals: [],
        commands: [],
      });

      // Both rows should appear
      expect(log.lines.length).toBe(2);
    });

    test('LIKE filter for search uses wildcard matching', async () => {
      const db = createTestDb(DB_PATH);
      insertRow(db, {
        ts: 1000,
        message: 'foo bar baz',
      });
      insertRow(db, {
        ts: 2000,
        message: 'hello world',
      });
      insertRow(db, {
        ts: 3000,
        message: 'foo qux',
      });
      db.close();

      await logCommand.handler({
        values: {
          search: 'foo',
          limit: 50,
        },
        positionals: [],
        commands: [],
      });

      // LIKE '%foo%' should match two rows
      expect(log.lines.length).toBe(2);
    });

    test('results are capped by LIMIT', async () => {
      const db = createTestDb(DB_PATH);
      for (let i = 0; i < 100; i++) {
        insertRow(db, {
          ts: i,
          message: `Entry ${i}`,
        });
      }
      db.close();

      await logCommand.handler({
        values: {
          limit: 5,
        },
        positionals: [],
        commands: [],
      });

      expect(log.lines.length).toBe(5);
    });

    test('LIMIT 1 returns only the most recent log (reversed)', async () => {
      const db = createTestDb(DB_PATH);
      // Insert in id order: 1, 2, 3
      insertRow(db, {
        ts: 1000,
        message: 'oldest',
      });
      insertRow(db, {
        ts: 2000,
        message: 'middle',
      });
      insertRow(db, {
        ts: 3000,
        message: 'newest',
      });
      db.close();

      await logCommand.handler({
        values: {
          limit: 1,
        },
        positionals: [],
        commands: [],
      });

      // ORDER BY id DESC LIMIT 1 picks id=3 ("newest"), toReversed keeps it
      expect(log.lines.length).toBe(1);
      expect(log.lines[0]).toContain('newest');
    });

    test('multiple filters produce AND conditions', async () => {
      const db = createTestDb(DB_PATH);
      insertRow(db, {
        ts: 1000,
        message: 'A',
        level: 'error',
        source: 'hub',
      });
      insertRow(db, {
        ts: 2000,
        message: 'B',
        level: 'error',
        source: 'plugin',
      });
      insertRow(db, {
        ts: 3000,
        message: 'C',
        level: 'info',
        source: 'hub',
      });
      db.close();

      await logCommand.handler({
        values: {
          level: 'error',
          source: 'hub',
          limit: 50,
        },
        positionals: [],
        commands: [],
      });

      expect(log.lines.length).toBe(1);
      expect(log.lines[0]).toContain('A');
    });

    test('row with meta JSON is correctly formatted in output', async () => {
      const db = createTestDb(DB_PATH);
      insertRow(db, {
        ts: 1700000000000,
        message: 'Request handled',
        meta: JSON.stringify({
          sourceFile: '/app/server.ts',
          sourceLine: 42,
        }),
      });
      db.close();

      await logCommand.handler({
        values: {
          limit: 50,
        },
        positionals: [],
        commands: [],
      });

      expect(log.lines.length).toBe(1);
      expect(log.lines[0]).toContain('Request handled');
    });

    test('row with error fields shows error info', async () => {
      const db = createTestDb(DB_PATH);
      insertRow(db, {
        ts: 1700000000000,
        message: 'Fatal crash',
        level: 'error',
        error_name: 'SyntaxError',
        error_message: 'Unexpected token',
      });
      db.close();

      await logCommand.handler({
        values: {
          limit: 50,
        },
        positionals: [],
        commands: [],
      });

      expect(log.lines.length).toBe(1);
      expect(log.lines[0]).toContain('Fatal crash');
    });
  });

  // ─── clearDb behavior (tested via handler) ────────────────────────────────

  describe('clearDb behavior (via handler)', () => {
    let backupPath: string | undefined;
    let log: ReturnType<typeof captureLog>;

    beforeEach(() => {
      if (existsSync(DB_PATH)) {
        backupPath = `${DB_PATH}.test-backup-c`;
        renameSync(DB_PATH, backupPath);
      }
      mkdirSync(DATA_DIR, {
        recursive: true,
      });
      log = captureLog();
    });

    afterEach(() => {
      log.restore();
      try {
        unlinkSync(DB_PATH);
      } catch {}
      try {
        unlinkSync(`${DB_PATH}-wal`);
      } catch {}
      try {
        unlinkSync(`${DB_PATH}-shm`);
      } catch {}
      if (backupPath && existsSync(backupPath)) {
        renameSync(backupPath, DB_PATH);
        backupPath = undefined;
      }
    });

    test('deletes all rows and returns count', async () => {
      const db = createTestDb(DB_PATH);
      insertRow(db, {
        ts: 1000,
        message: 'A',
      });
      insertRow(db, {
        ts: 2000,
        message: 'B',
      });
      insertRow(db, {
        ts: 3000,
        message: 'C',
      });
      insertRow(db, {
        ts: 4000,
        message: 'D',
      });
      insertRow(db, {
        ts: 5000,
        message: 'E',
      });
      db.close();

      await logCommand.handler({
        values: {
          clear: true,
          limit: 50,
        },
        positionals: [],
        commands: [],
      });

      const output = log.lines.join('\n');
      expect(output).toContain('5');
      expect(output).toContain('logs');
    });

    test('database table remains intact after clear', async () => {
      const db = createTestDb(DB_PATH);
      insertRow(db, {
        ts: 1000,
        message: 'Will be deleted',
      });
      db.close();

      await logCommand.handler({
        values: {
          clear: true,
          limit: 50,
        },
        positionals: [],
        commands: [],
      });

      // Table should still exist, just be empty
      const verifyDb = new Database(DB_PATH, {
        readonly: true,
      });
      const rows = verifyDb.query('SELECT COUNT(*) as cnt FROM logs').get() as {
        cnt: number;
      };
      expect(rows.cnt).toBe(0);
      verifyDb.close();
    });

    test('second clear on empty table reports 0', async () => {
      const db = createTestDb(DB_PATH);
      db.close();

      await logCommand.handler({
        values: {
          clear: true,
          limit: 50,
        },
        positionals: [],
        commands: [],
      });

      const output = log.lines.join('\n');
      expect(output).toContain('0 logs');
    });
  });
});
