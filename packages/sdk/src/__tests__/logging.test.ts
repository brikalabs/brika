/**
 * Tests for SDK logging API
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
function getCallArgs(index = 0): { level: string; message: string; meta: Record<string, unknown> } {
  const calls = mockLog.mock.calls;
  const call = calls[index];
  if (!call || call.length < 3) {
    throw new Error(`No call at index ${index}`);
  }
  // Runtime check guarantees at least 3 elements, safe to cast
  const args = call as unknown as [string, string, Record<string, unknown>];
  return { level: args[0], message: args[1], meta: args[2] };
}

describe('log API', () => {
  beforeEach(() => {
    mockLog.mockClear();
  });

  describe('log.debug', () => {
    test('calls context.log with debug level', () => {
      log.debug('debug message');

      expect(mockLog).toHaveBeenCalledTimes(1);
      const { level, message } = getCallArgs();
      expect(level).toBe('debug');
      expect(message).toBe('debug message');
    });

    test('passes metadata to context.log', () => {
      log.debug('debug message', { key: 'value' });

      const { meta } = getCallArgs();
      expect(meta.key).toBe('value');
    });

    test('includes call site in metadata', () => {
      log.debug('test');

      const { meta } = getCallArgs();
      expect(meta.sourceFile).toBeDefined();
      expect(meta.sourceLine).toBeDefined();
    });
  });

  describe('log.info', () => {
    test('calls context.log with info level', () => {
      log.info('info message');

      expect(mockLog).toHaveBeenCalledTimes(1);
      const { level, message } = getCallArgs();
      expect(level).toBe('info');
      expect(message).toBe('info message');
    });

    test('merges user metadata with call site', () => {
      log.info('test', { customField: 123 });

      const { meta } = getCallArgs();
      expect(meta.customField).toBe(123);
      expect(meta.sourceFile).toBeDefined();
    });
  });

  describe('log.warn', () => {
    test('calls context.log with warn level', () => {
      log.warn('warning message');

      expect(mockLog).toHaveBeenCalledTimes(1);
      const { level, message } = getCallArgs();
      expect(level).toBe('warn');
      expect(message).toBe('warning message');
    });
  });

  describe('log.error', () => {
    test('calls context.log with error level', () => {
      log.error('error message');

      expect(mockLog).toHaveBeenCalledTimes(1);
      const { level, message } = getCallArgs();
      expect(level).toBe('error');
      expect(message).toBe('error message');
    });

    test('extracts Error object details', () => {
      const error = new Error('test error');
      log.error('failed', { error: error as unknown as string });

      const { meta } = getCallArgs();
      expect(meta.errorName).toBe('Error');
      expect(meta.errorMessage).toBe('test error');
      expect(meta.errorStack).toBeDefined();
    });

    test('handles custom error types', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }
      const error = new CustomError('custom error');
      log.error('failed', { error: error as unknown as string });

      const { meta } = getCallArgs();
      expect(meta.errorName).toBe('CustomError');
      expect(meta.errorMessage).toBe('custom error');
    });

    test('preserves other metadata alongside error details', () => {
      const error = new Error('oops');
      log.error('operation failed', { error: error as unknown as string, requestId: 'abc123' });

      const { meta } = getCallArgs();
      expect(meta.requestId).toBe('abc123');
      expect(meta.errorMessage).toBe('oops');
    });

    test('handles non-Error objects in error field', () => {
      log.error('failed', { error: 'not an error object' });

      const { meta } = getCallArgs();
      // Non-Error objects should not get special handling
      expect(meta.errorName).toBeUndefined();
      expect(meta.error).toBe('not an error object');
    });
  });
});

describe('parseStackLine', () => {
  describe('Unix paths with parens', () => {
    test('parses standard function call', () => {
      const line = '    at someFunction (/Users/dev/project/src/file.ts:42:10)';
      const result = parseStackLine(line);

      expect(result).not.toBeNull();
      expect(result?.sourceFile).toBe('/Users/dev/project/src/file.ts');
      expect(result?.sourceLine).toBe(42);
    });

    test('parses anonymous function', () => {
      const line = '    at Object.<anonymous> (/app/index.ts:1:1)';
      const result = parseStackLine(line);

      expect(result).not.toBeNull();
      expect(result?.sourceFile).toBe('/app/index.ts');
      expect(result?.sourceLine).toBe(1);
    });

    test('parses path with special characters', () => {
      const line = '    at fn (/path/to/my-project_v2/src/file.spec.ts:100:5)';
      const result = parseStackLine(line);

      expect(result).not.toBeNull();
      expect(result?.sourceFile).toBe('/path/to/my-project_v2/src/file.spec.ts');
      expect(result?.sourceLine).toBe(100);
    });
  });

  describe('Unix paths without parens', () => {
    test('parses direct file reference', () => {
      const line = '    at /Users/dev/project/src/file.ts:42:10';
      const result = parseStackLine(line);

      expect(result).not.toBeNull();
      expect(result?.sourceFile).toBe('/Users/dev/project/src/file.ts');
      expect(result?.sourceLine).toBe(42);
    });
  });

  describe('Windows paths', () => {
    test('parses Windows path with parens', () => {
      const line = '    at someFunction (C:\\Users\\dev\\project\\src\\file.ts:42:10)';
      const result = parseStackLine(line);

      expect(result).not.toBeNull();
      expect(result?.sourceFile).toBe('C:\\Users\\dev\\project\\src\\file.ts');
      expect(result?.sourceLine).toBe(42);
    });

    test('parses Windows path without parens', () => {
      const line = '    at C:\\Users\\dev\\project\\src\\file.ts:42:10';
      const result = parseStackLine(line);

      expect(result).not.toBeNull();
      expect(result?.sourceFile).toBe('C:\\Users\\dev\\project\\src\\file.ts');
      expect(result?.sourceLine).toBe(42);
    });
  });

  describe('edge cases', () => {
    test('returns null for empty string', () => {
      expect(parseStackLine('')).toBeNull();
    });

    test('returns null for malformed line', () => {
      expect(parseStackLine('    at Array.forEach (<anonymous>)')).toBeNull();
    });

    test('handles single digit line numbers', () => {
      const result = parseStackLine('    at fn (/file.ts:1:1)');

      expect(result).not.toBeNull();
      expect(result?.sourceLine).toBe(1);
    });

    test('handles large line numbers', () => {
      const result = parseStackLine('    at fn (/file.ts:999999:999)');

      expect(result).not.toBeNull();
      expect(result?.sourceLine).toBe(999999);
    });
  });

  describe('ReDoS protection', () => {
    test('handles input with many colons efficiently', () => {
      const maliciousInput = '(' + ':'.repeat(100) + '!)';
      const startTime = performance.now();

      const result = parseStackLine(maliciousInput);

      const elapsed = performance.now() - startTime;
      expect(result).toBeNull();
      expect(elapsed).toBeLessThan(50);
    });

    test('handles repeated colon-digit patterns efficiently', () => {
      const segments = Array.from({ length: 50 }, (_, i) => `:${i}`).join('');
      const maliciousInput = `(${segments}!)`;
      const startTime = performance.now();

      const result = parseStackLine(maliciousInput);

      const elapsed = performance.now() - startTime;
      expect(result).toBeNull();
      expect(elapsed).toBeLessThan(50);
    });

    test('handles malicious input without parens efficiently', () => {
      const maliciousInput = 'at ' + ':'.repeat(100) + '!';
      const startTime = performance.now();

      const result = parseStackLine(maliciousInput);

      const elapsed = performance.now() - startTime;
      expect(result).toBeNull();
      expect(elapsed).toBeLessThan(50);
    });

    test('handles long valid path efficiently', () => {
      const longPath = '/a'.repeat(1000);
      const line = `    at fn (${longPath}/file.ts:42:10)`;
      const startTime = performance.now();

      const result = parseStackLine(line);

      const elapsed = performance.now() - startTime;
      expect(result).not.toBeNull();
      expect(result?.sourceFile).toBe(`${longPath}/file.ts`);
      expect(result?.sourceLine).toBe(42);
      expect(elapsed).toBeLessThan(50);
    });
  });
});
