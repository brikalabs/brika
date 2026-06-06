/**
 * Tests for log command pure helpers: rowToEvent() and matchesFilters()
 *
 * These functions are not exported, so we replicate their logic here
 * (same pattern used by module-compiler.test.ts for actionId).
 */

import { describe, expect, test } from 'bun:test';
import type { LogEvent, LogLevel, LogSource } from '@/runtime/logs/types';
import type { Json } from '@/types';

// ─── Replicated from cli/commands/log.ts ────────────────────────────────────

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

// ─── rowToEvent ─────────────────────────────────────────────────────────────

describe('rowToEvent', () => {
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

  test('converts a minimal row to a LogEvent', () => {
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
    const row: LogRow = {
      ...baseRow,
      plugin_name: 'my-plugin',
    };
    const event = rowToEvent(row);

    expect(event.pluginName).toBe('my-plugin');
  });

  test('converts null plugin_name to undefined', () => {
    const event = rowToEvent(baseRow);
    expect(event.pluginName).toBeUndefined();
  });

  test('parses JSON meta string', () => {
    const row: LogRow = {
      ...baseRow,
      meta: '{"key":"value","count":42}',
    };
    const event = rowToEvent(row);

    expect(event.meta).toEqual({
      key: 'value',
      count: 42,
    });
  });

  test('leaves meta undefined when null', () => {
    const event = rowToEvent(baseRow);
    expect(event.meta).toBeUndefined();
  });

  test('constructs error object when error_name is present', () => {
    const row: LogRow = {
      ...baseRow,
      error_name: 'TypeError',
      error_message: 'Cannot read property',
      error_stack: 'TypeError: Cannot read property\n    at foo.ts:10',
      error_cause: 'original cause',
    };
    const event = rowToEvent(row);

    expect(event.error).toBeDefined();
    expect(event.error?.name).toBe('TypeError');
    expect(event.error?.message).toBe('Cannot read property');
    expect(event.error?.stack).toBe('TypeError: Cannot read property\n    at foo.ts:10');
    expect(event.error?.cause).toBe('original cause');
  });

  test('constructs error object when only error_message is present', () => {
    const row: LogRow = {
      ...baseRow,
      error_name: null,
      error_message: 'Something failed',
      error_stack: null,
      error_cause: null,
    };
    const event = rowToEvent(row);

    expect(event.error).toBeDefined();
    expect(event.error?.name).toBe('Error');
    expect(event.error?.message).toBe('Something failed');
    expect(event.error?.stack).toBeUndefined();
    expect(event.error?.cause).toBeUndefined();
  });

  test('constructs error object when only error_name is present', () => {
    const row: LogRow = {
      ...baseRow,
      error_name: 'CustomError',
      error_message: null,
      error_stack: null,
      error_cause: null,
    };
    const event = rowToEvent(row);

    expect(event.error).toBeDefined();
    expect(event.error?.name).toBe('CustomError');
    expect(event.error?.message).toBe('');
  });

  test('does not create error when both error_name and error_message are null', () => {
    const event = rowToEvent(baseRow);
    expect(event.error).toBeUndefined();
  });

  test('preserves all LogLevel values', () => {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    for (const level of levels) {
      const row: LogRow = {
        ...baseRow,
        level,
      };
      const event = rowToEvent(row);
      expect(event.level).toBe(level);
    }
  });

  test('preserves LogSource values', () => {
    const sources: LogSource[] = ['hub', 'plugin', 'installer', 'registry', 'stderr', 'workflow'];
    for (const source of sources) {
      const row: LogRow = {
        ...baseRow,
        source,
      };
      const event = rowToEvent(row);
      expect(event.source).toBe(source);
    }
  });

  test('handles complex nested meta JSON', () => {
    const meta = {
      nested: {
        deep: {
          value: [1, 2, 3],
        },
      },
      flag: true,
    };
    const row: LogRow = {
      ...baseRow,
      meta: JSON.stringify(meta),
    };
    const event = rowToEvent(row);

    expect(event.meta).toEqual(meta);
  });

  test('error with partial fields uses undefined for missing optional fields', () => {
    const row: LogRow = {
      ...baseRow,
      error_name: 'Err',
      error_message: 'msg',
      error_stack: null,
      error_cause: null,
    };
    const event = rowToEvent(row);

    expect(event.error?.stack).toBeUndefined();
    expect(event.error?.cause).toBeUndefined();
  });
});

// ─── matchesFilters ─────────────────────────────────────────────────────────

describe('matchesFilters', () => {
  const baseEvent: LogEvent = {
    ts: 1700000000000,
    level: 'info',
    source: 'hub',
    message: 'Server started on port 3000',
  };

  test('returns true when no filters are set', () => {
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
    const eventWithPlugin: LogEvent = {
      ...baseEvent,
      pluginName: 'timer',
    };

    expect(
      matchesFilters(eventWithPlugin, {
        plugin: 'timer',
      })
    ).toBe(true);
    expect(
      matchesFilters(eventWithPlugin, {
        plugin: 'other',
      })
    ).toBe(false);
  });

  test('plugin filter rejects event without pluginName', () => {
    expect(
      matchesFilters(baseEvent, {
        plugin: 'timer',
      })
    ).toBe(false);
  });

  test('matches by search text (case-insensitive)', () => {
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
    expect(
      matchesFilters(baseEvent, {
        search: 'port 3000',
      })
    ).toBe(true);
  });

  test('search filter rejects non-matching text', () => {
    expect(
      matchesFilters(baseEvent, {
        search: 'shutdown',
      })
    ).toBe(false);
  });

  test('combines multiple filters with AND logic', () => {
    const event: LogEvent = {
      ts: 1700000000000,
      level: 'error',
      source: 'plugin',
      pluginName: 'timer',
      message: 'Connection timeout',
    };

    // All filters match
    expect(
      matchesFilters(event, {
        level: 'error',
        source: 'plugin',
        plugin: 'timer',
        search: 'timeout',
      })
    ).toBe(true);

    // One filter fails
    expect(
      matchesFilters(event, {
        level: 'error',
        source: 'hub',
      })
    ).toBe(false);
    expect(
      matchesFilters(event, {
        level: 'info',
        source: 'plugin',
      })
    ).toBe(false);
    expect(
      matchesFilters(event, {
        level: 'error',
        plugin: 'other',
      })
    ).toBe(false);
    expect(
      matchesFilters(event, {
        level: 'error',
        search: 'missing',
      })
    ).toBe(false);
  });

  test('search is a substring match, not exact', () => {
    expect(
      matchesFilters(baseEvent, {
        search: 'port',
      })
    ).toBe(true);
    expect(
      matchesFilters(baseEvent, {
        search: 'started',
      })
    ).toBe(true);
    expect(
      matchesFilters(baseEvent, {
        search: 'Server started on port 3000',
      })
    ).toBe(true);
  });

  test('empty search string matches everything', () => {
    // Empty string is falsy, so the filter is skipped
    expect(
      matchesFilters(baseEvent, {
        search: '',
      })
    ).toBe(true);
  });

  test('handles event with all optional fields', () => {
    const fullEvent: LogEvent = {
      ts: 1700000000000,
      level: 'warn',
      source: 'plugin',
      pluginName: 'weather',
      message: 'API rate limit approaching',
      meta: {
        remaining: 10,
      },
      error: {
        name: 'RateLimitWarning',
        message: 'Approaching limit',
      },
    };

    expect(
      matchesFilters(fullEvent, {
        level: 'warn',
        source: 'plugin',
        plugin: 'weather',
        search: 'rate limit',
      })
    ).toBe(true);
  });
});
