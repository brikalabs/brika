/**
 * Tests for SDK logging API
 *
 * Tests parseStackLine (pure function) and log methods (context delegation).
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';

// Mock the context module before importing logging
const mockLog = mock(() => undefined);
mock.module('../context', () => ({
  getContext: () => ({
    log: mockLog,
  }),
}));

// Import after mocking
const { log, parseStackLine } = await import('../api/logging');

/**
 * Helper to get typed call arguments from mock
 */
function getCallArgs(index = 0): {
  level: string;
  message: string;
  meta: Record<string, unknown>;
} {
  const calls = mockLog.mock.calls;
  const call = calls[index];
  if (!call || call.length < 3) {
    throw new Error(`No call at index ${index}`);
  }
  const args = call as unknown as [
    string,
    string,
    Record<string, unknown>,
  ];
  return {
    level: args[0],
    message: args[1],
    meta: args[2],
  };
}

describe('parseStackLine', () => {
  test('parses stack line with parentheses', () => {
    const result = parseStackLine('    at Object.<anonymous> (/Users/test/src/app.ts:42:10)');
    expect(result).toEqual({
      sourceFile: '/Users/test/src/app.ts',
      sourceLine: 42,
    });
  });

  test('parses stack line without parentheses', () => {
    const result = parseStackLine('    at /Users/test/src/index.ts:15:3');
    expect(result).toEqual({
      sourceFile: '/Users/test/src/index.ts',
      sourceLine: 15,
    });
  });

  test('parses Windows-style paths', () => {
    const result = parseStackLine('    at Object.<anonymous> (C:\\Users\\test\\app.ts:10:5)');
    expect(result).toEqual({
      sourceFile: 'C:\\Users\\test\\app.ts',
      sourceLine: 10,
    });
  });

  test('returns null for non-matching lines', () => {
    expect(parseStackLine('Error: something went wrong')).toBeNull();
    expect(parseStackLine('')).toBeNull();
    expect(parseStackLine('random text')).toBeNull();
  });

  test('returns null for node: internal paths', () => {
    // node:internal paths have a colon in the scheme, which the regex
    // correctly rejects — these are not real source files to report.
    const result = parseStackLine(
      '    at processTicksAndRejections (node:internal/process/task_queues:95:5)'
    );
    expect(result).toBeNull();
  });
});

describe('log', () => {
  beforeEach(() => {
    mockLog.mockClear();
  });

  test('log object has all four levels', () => {
    expect(typeof log.debug).toBe('function');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  test('log.debug delegates to context with debug level', () => {
    log.debug('debug msg');
    expect(mockLog).toHaveBeenCalledTimes(1);
    const { level, message } = getCallArgs();
    expect(level).toBe('debug');
    expect(message).toBe('debug msg');
  });

  test('log.info delegates to context with info level', () => {
    log.info('info msg');
    const { level, message } = getCallArgs();
    expect(level).toBe('info');
    expect(message).toBe('info msg');
  });

  test('log.warn delegates to context with warn level', () => {
    log.warn('warn msg');
    const { level, message } = getCallArgs();
    expect(level).toBe('warn');
    expect(message).toBe('warn msg');
  });

  test('log.error delegates to context with error level', () => {
    log.error('error msg');
    const { level, message } = getCallArgs();
    expect(level).toBe('error');
    expect(message).toBe('error msg');
  });

  test('passes user metadata through to context', () => {
    log.info('test', {
      requestId: 'abc',
    });
    const { meta } = getCallArgs();
    expect(meta.requestId).toBe('abc');
  });

  test('includes call site (sourceFile, sourceLine) in metadata', () => {
    log.debug('test');
    const { meta } = getCallArgs();
    expect(meta.sourceFile).toBeDefined();
    expect(meta.sourceLine).toBeDefined();
  });

  test('log.error extracts Error object details into meta', () => {
    const error = new Error('boom');
    log.error('failed', {
      error: error as unknown as string,
    });
    const { meta } = getCallArgs();
    expect(meta.errorName).toBe('Error');
    expect(meta.errorMessage).toBe('boom');
    expect(meta.errorStack).toBeDefined();
  });

  test('log.error does not extract non-Error values', () => {
    log.error('failed', {
      error: 'just a string',
    });
    const { meta } = getCallArgs();
    expect(meta.errorName).toBeUndefined();
    expect(meta.error).toBe('just a string');
  });
});
