/**
 * Tests for the plugin CLI subcommand group
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createCli } from '@/cli/cli';
import type { Command } from '@/cli/command';
import { captureExit, captureLog } from './helpers/capture';

// Build a minimal plugin subcommand group for testing
function buildPluginCli() {
  const handlers = {
    install: mock(),
    uninstall: mock(),
    list: mock(),
    before: mock(),
  };

  const install: Command = {
    name: 'install',
    description: 'Install a plugin',
    examples: [
      'brika plugin install @brika/plugin-timer',
    ],
    handler: handlers.install,
  };

  const uninstall: Command = {
    name: 'uninstall',
    aliases: [
      'remove',
    ],
    description: 'Uninstall a plugin',
    handler: handlers.uninstall,
  };

  const list: Command = {
    name: 'list',
    aliases: [
      'ls',
    ],
    description: 'List installed plugins',
    handler: handlers.list,
  };

  const cmd = createCli({
    defaultCommand: 'help',
    before: handlers.before,
  })
    .addCommand(install)
    .addCommand(uninstall)
    .addCommand(list)
    .addHelp()
    .toCommand('plugin', 'Manage plugins');

  return {
    cmd,
    handlers,
  };
}

describe('cli/commands/plugin (subcommand group)', () => {
  describe('structure', () => {
    test('toCommand returns a valid Command', () => {
      const { cmd } = buildPluginCli();
      expect(cmd.name).toBe('plugin');
      expect(cmd.description).toBe('Manage plugins');
      expect(typeof cmd.handler).toBe('function');
    });

    test('examples are collected from subcommands', () => {
      const { cmd } = buildPluginCli();
      expect(cmd.examples).toContain('brika plugin install @brika/plugin-timer');
    });
  });

  describe('dispatch', () => {
    test('dispatches "install" to install handler', async () => {
      const { cmd, handlers } = buildPluginCli();
      await cmd.handler({
        values: {},
        positionals: [
          'install',
          '@brika/plugin-timer',
        ],
        commands: [],
      });

      expect(handlers.install).toHaveBeenCalled();
      expect(handlers.before).toHaveBeenCalled();
    });

    test('dispatches "uninstall" to uninstall handler', async () => {
      const { cmd, handlers } = buildPluginCli();
      await cmd.handler({
        values: {},
        positionals: [
          'uninstall',
          '@brika/plugin-timer',
        ],
        commands: [],
      });

      expect(handlers.uninstall).toHaveBeenCalled();
    });

    test('dispatches "remove" alias to uninstall handler', async () => {
      const { cmd, handlers } = buildPluginCli();
      await cmd.handler({
        values: {},
        positionals: [
          'remove',
          '@brika/plugin-timer',
        ],
        commands: [],
      });

      expect(handlers.uninstall).toHaveBeenCalled();
    });

    test('dispatches "list" to list handler', async () => {
      const { cmd, handlers } = buildPluginCli();
      await cmd.handler({
        values: {},
        positionals: [
          'list',
        ],
        commands: [],
      });

      expect(handlers.list).toHaveBeenCalled();
    });

    test('dispatches "ls" alias to list handler', async () => {
      const { cmd, handlers } = buildPluginCli();
      await cmd.handler({
        values: {},
        positionals: [
          'ls',
        ],
        commands: [],
      });

      expect(handlers.list).toHaveBeenCalled();
    });
  });

  describe('help', () => {
    test('shows help when no subcommand given', async () => {
      const { cmd, handlers } = buildPluginCli();
      const log = captureLog();

      await cmd.handler({
        values: {},
        positionals: [],
        commands: [],
      });
      log.restore();

      const output = log.lines.join('\n');
      expect(output).toContain('brika plugin');
      expect(output).toContain('install');
      expect(output).toContain('uninstall');
      expect(output).toContain('list');
      // before hook should NOT run for help
      expect(handlers.before).not.toHaveBeenCalled();
    });

    test('shows help with "help" subcommand', async () => {
      const { cmd, handlers } = buildPluginCli();
      const log = captureLog();

      await cmd.handler({
        values: {},
        positionals: [
          'help',
        ],
        commands: [],
      });
      log.restore();

      expect(log.lines.join('\n')).toContain('brika plugin');
      expect(handlers.before).not.toHaveBeenCalled();
    });
  });

  describe('before hook', () => {
    test('runs before hook before subcommand handlers', async () => {
      const order: string[] = [];
      const cmd = createCli({
        defaultCommand: 'help',
        before: () => {
          order.push('before');
        },
      })
        .addCommand({
          name: 'action',
          description: 'Do it',
          handler() {
            order.push('action');
          },
        })
        .addHelp()
        .toCommand('test', 'Test');

      await cmd.handler({
        values: {},
        positionals: [
          'action',
        ],
        commands: [],
      });
      expect(order).toEqual([
        'before',
        'action',
      ]);
    });

    test('does not run before hook for help', async () => {
      const beforeFn = mock();
      const log = captureLog();

      const cmd = createCli({
        defaultCommand: 'help',
        before: beforeFn,
      })
        .addCommand({
          name: 'action',
          description: 'Do it',
          handler() {},
        })
        .addHelp()
        .toCommand('test', 'Test');

      await cmd.handler({
        values: {},
        positionals: [
          'help',
        ],
        commands: [],
      });
      log.restore();

      expect(beforeFn).not.toHaveBeenCalled();
    });
  });

  describe('unknown subcommand', () => {
    test('exits with error for unknown subcommand', async () => {
      const { cmd } = buildPluginCli();
      const exit = captureExit();

      try {
        await cmd.handler({
          values: {},
          positionals: [
            'nonexistent',
          ],
          commands: [],
        });
      } catch {}
      exit.restore();

      expect(exit.code).toBe(1);
      expect(exit.errors.some((e) => e.includes('nonexistent'))).toBe(true);
    });
  });
});
