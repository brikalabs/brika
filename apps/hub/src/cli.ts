/**
 * BRIKA CLI Entry Point
 *
 * Single-pass command dispatch with alias expansion.
 * Each command is self-contained with declarative metadata.
 */

import 'reflect-metadata';

import { parseArgs } from 'node:util';
import pc from 'picocolors';
import { commandMap, commands } from './cli/commands';
import { generateHelp } from './cli/help';

async function main() {
  const args = Bun.argv.slice(2);
  const first = args[0] ?? '';

  // Lookup command by name or alias, default to 'start'
  const command = commandMap.get(first || 'start');
  if (!command) {
    console.error(`${pc.red('Unknown command:')} ${first}`);
    console.error(`Run ${pc.cyan('brika help')} for usage.`);
    process.exit(1);
  }

  // Single-pass: parse with command-specific options + universal --help
  const skip = first ? 1 : 0;
  const parsed = parseArgs({
    args: args.slice(skip),
    options: {
      help: { type: 'boolean', short: 'h' },
      ...command.options,
    },
    allowPositionals: true,
    strict: false,
  });

  // Intercept --help/-h on any command (e.g. `brika start -h`)
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
