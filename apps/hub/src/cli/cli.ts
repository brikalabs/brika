import { parseArgs } from 'node:util';
import pc from 'picocolors';
import type { Command } from './command';
import { CliError } from './errors';
import { generateHelp } from './help';

export interface CliConfig {
  /** Default command when no args given (default: 'start') */
  defaultCommand?: string;
  /** Hook to run before any command handler (skipped for help) */
  before?: () => Promise<void> | void;
}

export interface Cli {
  readonly commands: Command[];
  addCommand(command: Command): Cli;
  addHelp(): Cli;
  get(name: string): Command | undefined;
  run(argv?: string[]): Promise<void>;
  toCommand(name: string, description: string): Command;
}

export function createCli(config?: CliConfig): Cli {
  let prefix = 'brika';
  const defaultCommand = config?.defaultCommand ?? 'start';
  const beforeFn = config?.before;

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
          handler({ positionals }) {
            const name = positionals[0];
            const cmd = name ? commands.find((c) => c.name === name) : undefined;
            console.log(generateHelp(commands, cmd, prefix));
          },
        });
      }
      return cli;
    },

    get(name: string): Command | undefined {
      return map.get(name);
    },

    async run(argv: string[] = Bun.argv.slice(2)): Promise<void> {
      if (argv.includes('--no-color')) {
        process.env.NO_COLOR = '1';
        argv = argv.filter((a) => a !== '--no-color');
      }

      try {
        const first = argv[0] ?? '';
        const command = map.get(first || defaultCommand);

        if (!command) {
          throw new CliError(
            `${pc.red('Unknown command:')} ${first}\nRun ${pc.cyan(`${prefix} help`)} for usage.`
          );
        }

        const skip = first ? 1 : 0;

        // Build parseArgs options — number types are parsed as strings then coerced
        const parseOptions: Record<string, { type: 'string' | 'boolean'; short?: string }> = {
          help: { type: 'boolean', short: 'h' },
        };
        if (command.options) {
          for (const [key, opt] of Object.entries(command.options)) {
            parseOptions[key] = {
              type: opt.type === 'number' ? 'string' : opt.type,
              short: opt.short,
            };
          }
        }

        const parsed = parseArgs({
          args: argv.slice(skip),
          options: parseOptions,
          allowPositionals: true,
          strict: false,
        });

        if (parsed.values.help) {
          console.log(generateHelp(commands, command, prefix));
          return;
        }

        // Apply number coercion and defaults
        const values: Record<string, string | boolean | number | undefined> = { ...parsed.values };
        if (command.options) {
          for (const [key, opt] of Object.entries(command.options)) {
            if (opt.type === 'number' && typeof values[key] === 'string') {
              values[key] = Number(values[key]);
            }
            if (values[key] === undefined && opt.default !== undefined) {
              values[key] = opt.default;
            }
          }
        }

        if (beforeFn && command.name !== 'help') await beforeFn();
        await command.handler({ values, positionals: parsed.positionals, commands });
      } catch (error) {
        if (error instanceof CliError) {
          console.error(error.message);
        } else {
          console.error(`${pc.red('Error:')} ${error instanceof Error ? error.message : error}`);
        }
        process.exit(1);
      }
    },

    toCommand(name: string, description: string): Command {
      prefix = `${prefix} ${name}`;
      return {
        name,
        description,
        subcommands: commands,
        examples: commands.flatMap((c) => c.examples ?? []).slice(0, 4),
        async handler({ positionals }) {
          await cli.run(positionals);
        },
      };
    },
  };

  return cli;
}
