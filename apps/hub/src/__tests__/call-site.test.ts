/**
 * Tests for call-site stack trace parsing
 */

import { describe, expect, test } from 'bun:test';
import { captureCallSite, parseStackLine } from '@/runtime/logs/utils/call-site';

describe('captureCallSite', () => {
  test('returns sourceFile and sourceLine from real call site', () => {
    const result = captureCallSite();

    expect(result.sourceFile).toBeDefined();
    expect(result.sourceLine).toBeDefined();
    expect(typeof result.sourceLine).toBe('number');
  });

  test('returns file path containing test file name', () => {
    const result = captureCallSite();

    expect(result.sourceFile).toContain('call-site.test.ts');
  });

  test('skips call-site.ts frames', () => {
    // When called from test, should not return call-site.ts
    const result = captureCallSite();

    expect(result.sourceFile).not.toContain('call-site.ts');
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

    test('parses path with dots in directory names', () => {
      const line = '    at fn (/path/to/.hidden/node_modules/@scope/pkg/index.js:50:3)';
      const result = parseStackLine(line);

      expect(result).not.toBeNull();
      expect(result?.sourceFile).toBe('/path/to/.hidden/node_modules/@scope/pkg/index.js');
      expect(result?.sourceLine).toBe(50);
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

    test('parses path with hyphens and underscores', () => {
      const line = '    at /my-app_v2/src/utils.ts:15:3';
      const result = parseStackLine(line);

      expect(result).not.toBeNull();
      expect(result?.sourceFile).toBe('/my-app_v2/src/utils.ts');
      expect(result?.sourceLine).toBe(15);
    });
  });

  describe('Windows paths with parens', () => {
    test('parses standard Windows path', () => {
      const line = '    at someFunction (C:\\Users\\dev\\project\\src\\file.ts:42:10)';
      const result = parseStackLine(line);

      expect(result).not.toBeNull();
      expect(result?.sourceFile).toBe('C:\\Users\\dev\\project\\src\\file.ts');
      expect(result?.sourceLine).toBe(42);
    });

    test('parses Windows path with forward slashes', () => {
      const line = '    at fn (D:/Projects/app/src/index.ts:100:1)';
      const result = parseStackLine(line);

      expect(result).not.toBeNull();
      expect(result?.sourceFile).toBe('D:/Projects/app/src/index.ts');
      expect(result?.sourceLine).toBe(100);
    });
  });

  describe('Windows paths without parens', () => {
    test('parses direct Windows file reference', () => {
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

    test('returns null for whitespace only', () => {
      expect(parseStackLine('    ')).toBeNull();
    });

    test('returns null for malformed line', () => {
      expect(parseStackLine('    at Array.forEach (<anonymous>)')).toBeNull();
    });

    test('returns null for native code', () => {
      expect(parseStackLine('    at native code')).toBeNull();
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

    test('handles file with numbers in name', () => {
      const result = parseStackLine('    at fn (/src/file2.test.ts:10:5)');

      expect(result).not.toBeNull();
      expect(result?.sourceFile).toBe('/src/file2.test.ts');
    });

    test('handles deeply nested paths', () => {
      const deepPath = '/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/file.ts';
      const result = parseStackLine(`    at fn (${deepPath}:10:5)`);

      expect(result).not.toBeNull();
      expect(result?.sourceFile).toBe(deepPath);
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

    test('handles many segments with colons and digits efficiently', () => {
      // Pattern that could cause exponential backtracking with naive regex
      const segments = Array.from(
        {
          length: 30,
        },
        (_, i) => `path${i}:${i}`
      ).join('/');
      const startTime = performance.now();

      const result = parseStackLine(`at (${segments}!)`);

      const elapsed = performance.now() - startTime;
      expect(result).toBeNull();
      expect(elapsed).toBeLessThan(50);
    });
  });
});
