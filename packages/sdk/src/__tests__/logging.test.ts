/**
 * Tests for SDK logging API
 *
 * NOTE: The `log API` tests (log.debug/info/warn/error) were removed because
 * they depend on mock.module('../context') which suffers from process-wide
 * bleed on CI (Bun #12823). Different test execution orders on Linux cause
 * another file's mock to override this file's mock, making `mockLog` never
 * get called. The log API is still exercised by api-logging.test.ts.
 * The parseStackLine tests below are pure-function tests that don't need mocking.
 */

import { describe, expect, test } from 'bun:test';
import { parseStackLine } from '../api/logging';

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
      const maliciousInput = `(${':'.repeat(100)}!)`;
      const startTime = performance.now();

      const result = parseStackLine(maliciousInput);

      const elapsed = performance.now() - startTime;
      expect(result).toBeNull();
      expect(elapsed).toBeLessThan(50);
    });

    test('handles repeated colon-digit patterns efficiently', () => {
      const segments = Array.from(
        {
          length: 50,
        },
        (_, i) => `:${i}`
      ).join('');
      const maliciousInput = `(${segments}!)`;
      const startTime = performance.now();

      const result = parseStackLine(maliciousInput);

      const elapsed = performance.now() - startTime;
      expect(result).toBeNull();
      expect(elapsed).toBeLessThan(50);
    });

    test('handles malicious input without parens efficiently', () => {
      const maliciousInput = `at ${':'.repeat(100)}!`;
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
