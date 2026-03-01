import { parseArgs } from 'node:util';
import pc from 'picocolors';
import type { Command, CommandOption } from './command';
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

type ParseOption = {
  type: 'string' | 'boolean';
  short?: string;
};

/** Strip --no-color from argv and set NO_COLOR env var if present. */
function stripNoColor(argv: string[]): string[] {
  if (!argv.includes('--no-color')) {
    return argv;
  }
  process.env.NO_COLOR = '1';
  return argv.filter((a) => a !== '--no-color');
}

/** Resolve the command from the first arg (or default), returning the command and the arg slice. */
function resolveCommand(
  first: string,
  defaultCommand: string,
  commandMap: Map<string, Command>,
  prefix: string
): {
  command: Command;
  argOffset: number;
} {
  const command = commandMap.get(first || defaultCommand);
  if (!command) {
    const helpCmd = `${prefix} help`;
    throw new CliError(
      `${pc.red('Unknown command:')} ${first}\nRun ${pc.cyan(helpCmd)} for usage.`
    );
  }
  return {
    command,
    argOffset: first ? 1 : 0,
  };
}

/** Format and throw a CLI error, or re-throw CliError as-is. */
function handleCliError(error: unknown): never {
  if (error instanceof CliError) {
    console.error(error.message);
  } else {
    console.error(`${pc.red('Error:')} ${error instanceof Error ? error.message : error}`);
  }
  process.exit(1);
}

function buildParseOptions(command: Command): Record<string, ParseOption> {
  const result: Record<string, ParseOption> = {
    help: {
      type: 'boolean',
      short: 'h',
    },
  };
  for (const [key, opt] of Object.entries(command.options ?? {})) {
    const entry: ParseOption = {
      type: opt.type === 'number' ? 'string' : opt.type,
    };
    if (opt.short) {
      entry.short = opt.short;
    }
    result[key] = entry;
  }
  return result;
}

function applyCoercionAndDefaults(
  raw: Record<string, unknown>,
  options: Record<string, CommandOption>
): Record<string, string | boolean | number | undefined> {
  const values = {
    ...raw,
  } as Record<string, string | boolean | number | undefined>;
  for (const [key, opt] of Object.entries(options)) {
    if (opt.type === 'number' && typeof values[key] === 'string') {
      values[key] = Number(values[key]);
    }
    values[key] ??= opt.default;
  }
  return values;
}

/** Remove a global flag and its value from argv (e.g. --cwd /path). */
function stripFlag(argv: string[], ...names: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (names.includes(argv[i]) && argv[i + 1]) {
      i++; // skip the value
    } else {
      out.push(argv[i]);
    }
  }
  return out;
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
            const cmd = positionals[0]
              ? commands.find((c) => c.name === positionals[0])
              : undefined;
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
      // Strip global options already handled by the entry point
      const cleanedArgv = stripNoColor(stripFlag(argv, '--cwd', '-C'));

      try {
        const first = cleanedArgv[0] ?? '';
        const { command, argOffset } = resolveCommand(first, defaultCommand, map, prefix);

        const parsed = parseArgs({
          args: cleanedArgv.slice(argOffset),
          options: buildParseOptions(command),
          allowPositionals: true,
          strict: false,
        });

        if (parsed.values.help) {
          console.log(generateHelp(commands, command, prefix));
          return;
        }

        const values = command.options
          ? applyCoercionAndDefaults(parsed.values, command.options)
          : {
              ...parsed.values,
            };

        if (beforeFn && command.name !== 'help') {
          await beforeFn();
        }
        await command.handler({
          values,
          positionals: parsed.positionals,
          commands,
        });
      } catch (error) {
        handleCliError(error);
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
