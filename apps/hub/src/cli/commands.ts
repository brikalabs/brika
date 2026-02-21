import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from './command';
import { generateHelp } from './help';

/**
 * Auto-discover commands from cli/commands/*.ts
 * To add a new command: create a file that `export default { ... } satisfies Command`
 */
const commandsDir = join(import.meta.dir, 'commands');

const commands: Command[] = readdirSync(commandsDir)
  .filter((f) => f.endsWith('.ts'))
  .sort()
  .map((f) => require(join(commandsDir, f)).default as Command)
  .filter(Boolean);

// Help needs the full command list, so it's defined after discovery
commands.push({
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

// Build lookup map: command names + aliases (with collision detection)
export const commandMap = new Map<string, Command>();

function register(key: string, cmd: Command) {
  const existing = commandMap.get(key);
  if (existing) {
    throw new Error(
      `CLI command collision: "${key}" is claimed by both "${existing.name}" and "${cmd.name}"`
    );
  }
  commandMap.set(key, cmd);
}

for (const cmd of commands) {
  register(cmd.name, cmd);
  for (const alias of cmd.aliases ?? []) {
    register(alias, cmd);
  }
}

export { commands };
