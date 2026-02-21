/**
 * Tests for CLI command registry and auto-discovery
 */

import { describe, expect, test } from 'bun:test';
import { cli } from '@/cli/commands';

const { commands } = cli;

describe('cli/commands', () => {
  const expectedCommands = [
    'start',
    'stop',
    'status',
    'open',
    'plugin',
    'version',
    'update',
    'uninstall',
    'help',
  ];

  describe('auto-discovery', () => {
    test('discovers all built-in commands', () => {
      const names = commands.map((c) => c.name);
      for (const name of expectedCommands) {
        expect(names).toContain(name);
      }
    });

    test('every command has a name and description', () => {
      for (const cmd of commands) {
        expect(cmd.name).toBeTruthy();
        expect(cmd.description).toBeTruthy();
      }
    });

    test('every command has a handler function', () => {
      for (const cmd of commands) {
        expect(typeof cmd.handler).toBe('function');
      }
    });

    test('help command is always last', () => {
      const last = commands[commands.length - 1];
      expect(last.name).toBe('help');
    });
  });

  describe('commandMap', () => {
    test('resolves commands by name', () => {
      for (const name of expectedCommands) {
        expect(cli.get(name)?.name).toBe(name);
      }
    });

    test('resolves version command via -v alias', () => {
      expect(cli.get('-v')?.name).toBe('version');
    });

    test('resolves version command via --version alias', () => {
      expect(cli.get('--version')?.name).toBe('version');
    });

    test('resolves help command via -h alias', () => {
      expect(cli.get('-h')?.name).toBe('help');
    });

    test('resolves help command via --help alias', () => {
      expect(cli.get('--help')?.name).toBe('help');
    });

    test('returns undefined for unknown command', () => {
      expect(cli.get('nonexistent')).toBeUndefined();
    });
  });

  describe('collision detection', () => {
    test('no duplicate names or aliases exist in the registry', () => {
      const seen = new Map<string, string>();
      for (const cmd of commands) {
        const keys = [cmd.name, ...(cmd.aliases ?? [])];
        for (const key of keys) {
          const existing = seen.get(key);
          if (existing) {
            throw new Error(`Collision: "${key}" claimed by both "${existing}" and "${cmd.name}"`);
          }
          seen.set(key, cmd.name);
        }
      }
    });
  });
});
