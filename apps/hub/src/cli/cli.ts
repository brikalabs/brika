import { parseArgs } from 'node:util';
import pc from 'picocolors';
import type { Command } from './command';
import { generateHelp } from './help';

export interface Cli {
  readonly commands: Command[];
  addCommand(command: Command): Cli;
  addHelp(): Cli;
  get(name: string): Command | undefined;
  run(argv?: string[]): Promise<void>;
}

export function createCli(): Cli {
  const commands: Command[] = [];
  const map = new Map<string, Command>();

  function register(key: string, cmd: Command): void {
    const existing = map.get(key);
    if (existing) {
      throw new Error(
        `CLI command collision: "${key}" is claimed by both "${existing.name}" and "${cmd.name}"`
      );
    }
    map.set(key, cmd);
  }

  const cli: Cli = {
    commands,

    addCommand(command: Command): Cli {
      commands.push(command);
      register(command.name, command);
      for (const alias of command.aliases ?? []) {
        register(alias, command);
      }
      return cli;
    },

    addHelp(): Cli {
      if (!map.has('help')) {
        cli.addCommand({
          name: 'help',
          aliases: ['-h', '--help'],
          description: 'Show help for a command',
          examples: ['brika help', 'brika help start'],
          handler({ positionals }) {
            const name = positionals[0];
            const cmd = name ? commands.find((c) => c.name === name) : undefined;
            console.log(generateHelp(commands, cmd));
          },
        });
      }
      return cli;
    },

    get(name: string): Command | undefined {
      return map.get(name);
    },

    async run(argv: string[] = Bun.argv.slice(2)): Promise<void> {
      const first = argv[0] ?? '';
      const command = map.get(first || 'start');

      if (!command) {
        console.error(`${pc.red('Unknown command:')} ${first}`);
        console.error(`Run ${pc.cyan('brika help')} for usage.`);
        process.exit(1);
      }

      const skip = first ? 1 : 0;
      const parsed = parseArgs({
        args: argv.slice(skip),
        options: {
          help: { type: 'boolean', short: 'h' },
          ...command.options,
        },
        allowPositionals: true,
        strict: false,
      });

      if (parsed.values.help) {
        console.log(generateHelp(commands, command));
        return;
      }

      try {
        await command.handler(parsed);
      } catch (error) {
        console.error(`${pc.red('Error:')} ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    },
  };

  return cli;
}
