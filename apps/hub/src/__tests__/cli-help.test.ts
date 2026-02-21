/**
 * Tests for CLI help generation
 */

import { describe, expect, test } from 'bun:test';
import pc from 'picocolors';
import type { Command } from '@/cli/command';
import { generateHelp } from '@/cli/help';

const testCommands: Command[] = [
  {
    name: 'start',
    description: 'Start the server',
    options: {
      port: { type: 'string', short: 'p', description: 'Port number' },
      verbose: { type: 'boolean', short: 'V', description: 'Verbose output' },
    },
    examples: ['brika start', 'brika start -p 8080'],
    handler() {},
  },
  {
    name: 'stop',
    description: 'Stop the server',
    handler() {},
  },
];

describe('cli/help', () => {
  describe('generateHelp (global)', () => {
    test('includes all command names', () => {
      const output = generateHelp(testCommands);
      expect(output).toContain('start');
      expect(output).toContain('stop');
    });

    test('includes command descriptions', () => {
      const output = generateHelp(testCommands);
      expect(output).toContain('Start the server');
      expect(output).toContain('Stop the server');
    });

    test('includes usage line', () => {
      const output = generateHelp(testCommands);
      expect(output).toContain('brika [command] [options]');
    });

    test('includes examples section', () => {
      const output = generateHelp(testCommands);
      expect(output).toContain('brika start -p 8080');
    });
  });

  describe('generateHelp with custom prefix', () => {
    test('uses custom prefix in global help', () => {
      const output = generateHelp(testCommands, undefined, 'brika plugin');
      expect(output).toContain('brika plugin');
      expect(output).not.toContain('Build. Run. Integrate.');
    });

    test('uses custom prefix in command help', () => {
      const output = generateHelp(testCommands, testCommands[0], 'brika plugin');
      expect(output).toContain('brika plugin start');
    });

    test('default prefix is brika', () => {
      const output = generateHelp(testCommands);
      expect(output).toContain('Build. Run. Integrate.');
    });
  });

  describe('generateHelp (command-specific)', () => {
    test('includes command name in header', () => {
      const output = generateHelp(testCommands, testCommands[0]);
      expect(output).toContain('brika start');
    });

    test('includes command description', () => {
      const output = generateHelp(testCommands, testCommands[0]);
      expect(output).toContain('Start the server');
    });

    test('lists flags with short aliases', () => {
      const output = generateHelp(testCommands, testCommands[0]);
      expect(output).toContain('-p, --port');
      expect(output).toContain('Port number');
      expect(output).toContain('-V, --verbose');
      expect(output).toContain('Verbose output');
    });

    test('lists examples', () => {
      const output = generateHelp(testCommands, testCommands[0]);
      expect(output).toContain('brika start');
      expect(output).toContain('brika start -p 8080');
    });

    test('omits flags section when no options', () => {
      const output = generateHelp(testCommands, testCommands[1]);
      expect(output).not.toContain('Flags:');
    });

    test('includes details when present', () => {
      const cmd: Command = {
        name: 'test',
        description: 'A test command',
        details: 'Extended details here.',
        handler() {},
      };
      const output = generateHelp([], cmd);
      expect(output).toContain('Extended details here.');
    });

    test('omits examples section when none defined', () => {
      const cmd: Command = {
        name: 'test',
        description: 'A test command',
        handler() {},
      };
      const output = generateHelp([], cmd);
      expect(output).not.toContain('Examples:');
    });
  });
});
