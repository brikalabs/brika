/**
 * Pure-function tests for the LogPane formatters. Pinned to UTC so the
 * timestamp slice (`toISOString().slice(11, 19)`) is portable across CI
 * regions.
 */
import { describe, expect, test } from 'bun:test';
import type { LogEventDto } from '../../shared/cli/api';
import { buildLabel, clamp, formatEvent, levelColor } from './format';
import type { LogSearchControls } from './search/useLogSearch';

const baseSearch: LogSearchControls = {
  mode: 'idle',
  query: '',
  results: [],
  currentIdx: 0,
  current: null,
  error: null,
  enter: () => {},
  cancel: () => {},
  commit: () => {},
  next: () => {},
  prev: () => {},
  clear: () => {},
};

describe('formatEvent', () => {
  test('formats ts + level + source + message in fixed columns', () => {
    const event: LogEventDto = {
      ts: Date.UTC(2025, 0, 2, 3, 4, 5),
      level: 'info',
      source: 'hub',
      message: 'hello',
    };
    expect(formatEvent(event)).toBe(`03:04:05  info  ${'hub'.padEnd(20)} hello`);
  });

  test('appends pluginName to source when present', () => {
    const event: LogEventDto = {
      ts: Date.UTC(2025, 0, 2, 3, 4, 5),
      level: 'warn',
      source: 'plugin',
      pluginName: 'acme',
      message: 'oops',
    };
    expect(formatEvent(event)).toBe(`03:04:05  warn  ${'plugin/acme'.padEnd(20)} oops`);
  });
});

describe('levelColor', () => {
  test('maps fatal and error to red', () => {
    expect(levelColor('fatal')).toBe('red');
    expect(levelColor('error')).toBe('red');
    expect(levelColor('ERROR')).toBe('red');
  });

  test('maps warn / warning to yellow', () => {
    expect(levelColor('warn')).toBe('yellow');
    expect(levelColor('warning')).toBe('yellow');
  });

  test('maps info to cyan', () => {
    expect(levelColor('info')).toBe('cyan');
  });

  test('maps debug and trace to gray', () => {
    expect(levelColor('debug')).toBe('gray');
    expect(levelColor('trace')).toBe('gray');
  });

  test('returns undefined for unknown levels', () => {
    expect(levelColor('verbose')).toBeUndefined();
    expect(levelColor('')).toBeUndefined();
  });
});

describe('buildLabel', () => {
  test('idle with no query → bare "hub"', () => {
    expect(buildLabel(baseSearch)).toBe('hub');
  });

  test('loading without query → searching… banner', () => {
    expect(buildLabel({ ...baseSearch, mode: 'loading' })).toBe('hub · searching…');
  });

  test('loading with query → /q/ searching… banner', () => {
    expect(buildLabel({ ...baseSearch, mode: 'loading', query: 'boom' })).toBe(
      'hub · /boom/ · searching…'
    );
  });

  test('ready + query + no matches → "no matches"', () => {
    expect(buildLabel({ ...baseSearch, mode: 'ready', query: 'zzz' })).toBe('hub · /zzz/ no matches');
  });

  test('ready + query + matches → "N/total" position', () => {
    const results = [
      { id: 1, ts: 0, level: 'info', source: 'hub', message: 'a' },
      { id: 2, ts: 0, level: 'info', source: 'hub', message: 'b' },
      { id: 3, ts: 0, level: 'info', source: 'hub', message: 'c' },
    ];
    const label = buildLabel({
      ...baseSearch,
      mode: 'ready',
      query: 'a',
      results,
      currentIdx: 1,
      current: results[1] ?? null,
    });
    expect(label).toBe('hub · /a/ 2/3');
  });
});

describe('clamp', () => {
  test('returns the value unchanged when inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  test('clamps to min when below', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  test('clamps to max when above', () => {
    expect(clamp(99, 0, 10)).toBe(10);
  });

  test('handles min === max', () => {
    expect(clamp(7, 4, 4)).toBe(4);
  });
});
