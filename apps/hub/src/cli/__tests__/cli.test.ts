import { describe, expect, it, mock } from 'bun:test';
import { createCli } from '../cli';
import { defineCommand } from '../command';

// Suppress process.exit calls during tests
mock.module('node:process', () => ({ exit: mock() }));

function spyCli() {
  const log: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => log.push(args.join(' '));
  const restore = () => {
    console.log = originalLog;
  };
  return { log, restore };
}

describe('createCli', () => {
  it('handles options without a short flag', async () => {
    const handler = mock();
    const cli = createCli().addCommand(
      defineCommand({
        name: 'start',
        description: 'test',
        options: {
          port: { type: 'string', short: 'p' },
          host: { type: 'string' },
        },
        handler,
      })
    );

    await cli.run(['start', '--host', '0.0.0.0', '-p', '8080']);

    expect(handler).toHaveBeenCalledTimes(1);
    const { values } = handler.mock.calls[0][0];
    expect(values.host).toBe('0.0.0.0');
    expect(values.port).toBe('8080');
  });

  it('applies number coercion', async () => {
    const handler = mock();
    const cli = createCli().addCommand(
      defineCommand({
        name: 'run',
        description: 'test',
        options: { count: { type: 'number', short: 'n' } },
        handler,
      })
    );

    await cli.run(['run', '-n', '42']);

    expect(handler.mock.calls[0][0].values.count).toBe(42);
  });

  it('applies default values for missing options', async () => {
    const handler = mock();
    const cli = createCli().addCommand(
      defineCommand({
        name: 'run',
        description: 'test',
        options: {
          verbose: { type: 'boolean', default: false },
          port: { type: 'number', default: 3001 },
        },
        handler,
      })
    );

    await cli.run(['run']);

    const { values } = handler.mock.calls[0][0];
    expect(values.verbose).toBe(false);
    expect(values.port).toBe(3001);
  });

  it('runs the default command when no args are given', async () => {
    const handler = mock();
    const cli = createCli({ defaultCommand: 'start' }).addCommand(
      defineCommand({ name: 'start', description: 'test', handler })
    );

    await cli.run([]);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('shows help when --help flag is passed', async () => {
    const handler = mock();
    const spy = spyCli();
    const cli = createCli().addCommand(
      defineCommand({ name: 'start', description: 'Start the server', handler })
    );

    await cli.run(['start', '--help']);
    spy.restore();

    expect(handler).not.toHaveBeenCalled();
    expect(spy.log.join('\n')).toContain('Start the server');
  });

  it('rejects duplicate command names', () => {
    const cmd = defineCommand({ name: 'foo', description: 'test', handler() {} });

    expect(() => createCli().addCommand(cmd).addCommand(cmd)).toThrow('collision');
  });

  it('resolves commands by alias', async () => {
    const handler = mock();
    const cli = createCli().addCommand(
      defineCommand({ name: 'version', description: 'test', aliases: ['-v'], handler })
    );

    await cli.run(['-v']);

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
