/**
 * Tests for createCli — config, subcommand nesting, before hook
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createCli } from '@/cli/cli';
import type { Command } from '@/cli/command';
import { captureExit, captureLog } from './helpers/capture';

const noop: Command = { name: 'ping', description: 'Ping', handler() {} };

describe('createCli', () => {
  describe('defaults', () => {
    test('defaults to "start" command when no args', async () => {
      const handler = mock();
      const cli = createCli()
        .addCommand({ name: 'start', description: 'Start', handler })
        .addHelp();

      await cli.run([]);
      expect(handler).toHaveBeenCalled();
    });

    test('resolves command by name', () => {
      const cli = createCli().addCommand(noop);
      expect(cli.get('ping')?.name).toBe('ping');
    });

    test('resolves aliases', () => {
      const cli = createCli().addCommand({ ...noop, aliases: ['-p'] });
      expect(cli.get('-p')?.name).toBe('ping');
    });

    test('returns undefined for unknown', () => {
      const cli = createCli().addCommand(noop);
      expect(cli.get('nope')).toBeUndefined();
    });
  });

  describe('config.defaultCommand', () => {
    test('uses custom default command', async () => {
      const handler = mock();
      const cli = createCli({ defaultCommand: 'help' })
        .addCommand(noop)
        .addCommand({ name: 'help', description: 'Help', handler });

      await cli.run([]);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('config.before', () => {
    test('runs before hook before command handler', async () => {
      const order: string[] = [];
      const cli = createCli({
        before: () => {
          order.push('before');
        },
      }).addCommand({
        name: 'start',
        description: 'Start',
        handler() {
          order.push('handler');
        },
      });

      await cli.run(['start']);
      expect(order).toEqual(['before', 'handler']);
    });

    test('skips before hook for help command', async () => {
      const beforeFn = mock();
      const log = captureLog();

      const cli = createCli({ before: beforeFn }).addCommand(noop).addHelp();

      await cli.run(['help']);
      log.restore();

      expect(beforeFn).not.toHaveBeenCalled();
    });

    test('skips before hook when --help flag used', async () => {
      const beforeFn = mock();
      const log = captureLog();

      const cli = createCli({ before: beforeFn }).addCommand(noop).addHelp();

      await cli.run(['ping', '--help']);
      log.restore();

      expect(beforeFn).not.toHaveBeenCalled();
    });
  });

  describe('collision detection', () => {
    test('throws on duplicate command names', () => {
      const cli = createCli().addCommand(noop);
      expect(() => cli.addCommand(noop)).toThrow(/collision/i);
    });

    test('throws on alias colliding with existing name', () => {
      const cli = createCli().addCommand(noop);
      expect(() =>
        cli.addCommand({ name: 'other', description: 'Other', aliases: ['ping'], handler() {} })
      ).toThrow(/collision/i);
    });
  });

  describe('unknown command', () => {
    test('exits with code 1 for unknown command', async () => {
      const exit = captureExit();
      const cli = createCli().addCommand(noop).addHelp();

      try {
        await cli.run(['nonexistent']);
      } catch {}
      exit.restore();

      expect(exit.code).toBe(1);
    });
  });

  describe('toCommand', () => {
    test('returns a Command with correct name and description', () => {
      const cmd = createCli().addCommand(noop).addHelp().toCommand('sub', 'A subcommand');

      expect(cmd.name).toBe('sub');
      expect(cmd.description).toBe('A subcommand');
    });

    test('collects examples from child commands', () => {
      const cmd = createCli()
        .addCommand({ ...noop, examples: ['brika sub ping'] })
        .addHelp()
        .toCommand('sub', 'A subcommand');

      expect(cmd.examples).toContain('brika sub ping');
    });

    test('dispatches positionals to nested cli.run', async () => {
      const handler = mock();

      const cmd = createCli({ defaultCommand: 'help' })
        .addCommand({ name: 'action', description: 'Do it', handler })
        .addHelp()
        .toCommand('sub', 'Sub');

      await cmd.handler({ values: {}, positionals: ['action', 'arg1'] });
      expect(handler).toHaveBeenCalled();
      // The nested handler receives ['arg1'] as positionals
      const call = handler.mock.calls[0] as [{ positionals: string[] }];
      expect(call[0].positionals).toContain('arg1');
    });

    test('prefix is composed from parent for help display', () => {
      const log = captureLog();

      const nested = createCli({ defaultCommand: 'help' }).addCommand(noop).addHelp();

      nested.toCommand('sub', 'Sub');

      // Now run help — it should show "brika sub" prefix
      nested.run(['help']);
      log.restore();

      const output = log.lines.join('\n');
      expect(output).toContain('brika sub');
    });
  });

  describe('error handling', () => {
    test('catches handler errors and prints them', async () => {
      const exit = captureExit();

      const cli = createCli().addCommand({
        name: 'start',
        description: 'Start',
        handler() {
          throw new Error('boom');
        },
      });

      try {
        await cli.run(['start']);
      } catch {}
      const errors = [...exit.errors];
      exit.restore();

      expect(exit.code).toBe(1);
      expect(errors.some((e) => e.includes('boom'))).toBe(true);
    });
  });
});
