import { describe, expect, test } from 'bun:test';
import { statusColor, statusGlyph, statusLabel, summarizeCrash, type TuiStatus } from './status';

const pending: TuiStatus = { kind: 'pending' };
const starting: TuiStatus = { kind: 'starting' };
const healthy: TuiStatus = { kind: 'healthy' };

function crashed(exitCode: number | null, reason = ''): TuiStatus {
  return { kind: 'crashed', exitCode, reason };
}

describe('statusColor', () => {
  test.each([
    [pending, 'cyan'],
    [starting, 'yellow'],
    [healthy, 'green'],
    [crashed(1), 'red'],
  ])('%o → %s', (status, expected) => {
    expect(statusColor(status)).toBe(expected);
  });
});

describe('statusGlyph', () => {
  test.each([
    [pending, '◌'],
    [starting, '◐'],
    [healthy, '●'],
    [crashed(1), '✘'],
  ])('%o → %s', (status, expected) => {
    expect(statusGlyph(status)).toBe(expected);
  });
});

describe('statusLabel', () => {
  test('pending', () => {
    expect(statusLabel(pending)).toBe('waiting on deps');
  });
  test('starting', () => {
    expect(statusLabel(starting)).toBe('starting');
  });
  test('healthy', () => {
    expect(statusLabel(healthy)).toBe('healthy');
  });
  test('crashed delegates to summarizeCrash', () => {
    expect(statusLabel(crashed(1))).toBe('exit 1');
    expect(statusLabel(crashed(0))).toBe('exited cleanly');
    expect(statusLabel(crashed(137))).toBe('killed (SIGKILL)');
  });
});

describe('summarizeCrash', () => {
  test('exit code 0 → exited cleanly', () => {
    expect(summarizeCrash(crashed(0) as never)).toEqual({
      headline: 'exited cleanly',
      detail: null,
    });
  });

  test('non-zero exit code → exit N', () => {
    expect(summarizeCrash(crashed(1) as never).headline).toBe('exit 1');
    expect(summarizeCrash(crashed(42) as never).headline).toBe('exit 42');
  });

  test.each([
    [129, 'killed (SIGHUP)'],
    [130, 'killed (SIGINT)'],
    [131, 'killed (SIGQUIT)'],
    [134, 'killed (SIGABRT)'],
    [137, 'killed (SIGKILL)'],
    [139, 'killed (SIGSEGV)'],
    [141, 'killed (SIGPIPE)'],
    [143, 'killed (SIGTERM)'],
  ])('signal exit code %i → %s', (code, expected) => {
    expect(summarizeCrash(crashed(code) as never).headline).toBe(expected);
  });

  test('null exit code with empty reason → generic spawn error', () => {
    expect(summarizeCrash(crashed(null, '') as never)).toEqual({
      headline: 'spawn error',
      detail: null,
    });
  });

  test('null exit code with ENOENT-style reason → promotes code prefix', () => {
    expect(summarizeCrash(crashed(null, 'ENOENT: no such file') as never)).toEqual({
      headline: 'ENOENT',
      detail: 'no such file',
    });
  });

  test('null exit code with EACCES → promotes code prefix', () => {
    expect(summarizeCrash(crashed(null, 'EACCES:permission denied') as never)).toEqual({
      headline: 'EACCES',
      detail: 'permission denied',
    });
  });

  test('null exit code with free-form error → falls through to spawn error + detail', () => {
    expect(summarizeCrash(crashed(null, 'Something unexpected happened') as never)).toEqual({
      headline: 'spawn error',
      detail: 'Something unexpected happened',
    });
  });
});
