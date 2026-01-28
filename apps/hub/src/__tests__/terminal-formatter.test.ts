/**
 * Tests for TerminalFormatter
 */

import { describe, expect, test } from 'bun:test';
import type { LogEvent } from '@brika/shared';
import { TerminalFormatter } from '@/runtime/logs/formatters/terminal-formatter';

const createLogEvent = (overrides: Partial<LogEvent> = {}): LogEvent => ({
  ts: new Date('2024-01-15T12:00:00Z').getTime(),
  level: 'info',
  source: 'hub',
  message: 'Test message',
  ...overrides,
});

describe('TerminalFormatter', () => {
  describe('format', () => {
    test('formats basic log event with color', () => {
      const formatter = new TerminalFormatter({ color: true });
      const event = createLogEvent();

      const output = formatter.format(event);

      expect(output).toContain('Test message');
      expect(output).toContain('hub');
    });

    test('formats basic log event without color', () => {
      const formatter = new TerminalFormatter({ color: false });
      const event = createLogEvent();

      const output = formatter.format(event);

      expect(output).toContain('Test message');
      expect(output).toContain('INFO');
    });

    test('includes plugin name in source', () => {
      const formatter = new TerminalFormatter({ color: false });
      const event = createLogEvent({
        source: 'plugin',
        pluginName: 'myplugin',
      });

      const output = formatter.format(event);

      // Source is padded/truncated to SOURCE_WIDTH (18 chars)
      expect(output).toContain('plugin:myplugin');
    });

    test('formats metadata', () => {
      const formatter = new TerminalFormatter({ color: false });
      const event = createLogEvent({
        meta: {
          key1: 'value1',
          key2: 42,
          key3: true,
          key4: null,
        },
      });

      const output = formatter.format(event);

      expect(output).toContain('key1');
      expect(output).toContain('"value1"');
      expect(output).toContain('key2');
      expect(output).toContain('42');
    });

    test('formats error level', () => {
      const formatter = new TerminalFormatter({ color: false });
      const event = createLogEvent({
        level: 'error',
        message: 'Error occurred',
      });

      const output = formatter.format(event);

      expect(output).toContain('ERROR');
      expect(output).toContain('Error occurred');
    });

    test('formats warn level', () => {
      const formatter = new TerminalFormatter({ color: false });
      const event = createLogEvent({
        level: 'warn',
        message: 'Warning message',
      });

      const output = formatter.format(event);

      expect(output).toContain('WARN');
    });

    test('formats debug level', () => {
      const formatter = new TerminalFormatter({ color: false });
      const event = createLogEvent({
        level: 'debug',
        message: 'Debug info',
      });

      const output = formatter.format(event);

      expect(output).toContain('DEBUG');
    });

    test('formats source file location', () => {
      const formatter = new TerminalFormatter({ color: false });
      const event = createLogEvent({
        meta: {
          sourceFile: '/path/to/some/file.ts',
          sourceLine: 42,
        },
      });

      const output = formatter.format(event);

      expect(output).toContain('some/file.ts:42');
    });

    test('formats error with stack trace', () => {
      const formatter = new TerminalFormatter({ color: false });
      const event = createLogEvent({
        level: 'error',
        meta: {
          __error: {
            name: 'TypeError',
            message: 'Cannot read property',
            stack: 'TypeError: Cannot read property\n    at foo (file.ts:10)',
          },
        },
      });

      const output = formatter.format(event);

      expect(output).toContain('Error:');
      expect(output).toContain('Cannot read property');
    });

    test('formats error with cause', () => {
      const formatter = new TerminalFormatter({ color: false });
      const event = createLogEvent({
        level: 'error',
        meta: {
          __error: {
            name: 'Error',
            message: 'Outer error',
            cause: 'Inner error reason',
          },
        },
      });

      const output = formatter.format(event);

      expect(output).toContain('Caused by:');
      expect(output).toContain('Inner error reason');
    });

    test('handles multi-line string values', () => {
      const formatter = new TerminalFormatter({ color: false });
      const event = createLogEvent({
        meta: {
          multiline: 'line1\nline2\nline3',
        },
      });

      const output = formatter.format(event);

      expect(output).toContain('line1');
      expect(output).toContain('line2');
    });

    test('handles nested object metadata', () => {
      const formatter = new TerminalFormatter({ color: false });
      const event = createLogEvent({
        meta: {
          nested: { foo: 'bar', baz: 123 },
        },
      });

      const output = formatter.format(event);

      expect(output).toContain('nested');
    });
  });

  describe('color modes', () => {
    test('colored output differs from plain output', () => {
      const coloredFormatter = new TerminalFormatter({ color: true });
      const plainFormatter = new TerminalFormatter({ color: false });
      const event = createLogEvent();

      const coloredOutput = coloredFormatter.format(event);
      const plainOutput = plainFormatter.format(event);

      // They should contain the same content but be formatted differently
      expect(coloredOutput).not.toBe(plainOutput);
      expect(coloredOutput).toContain('Test message');
      expect(plainOutput).toContain('Test message');
    });
  });
});
