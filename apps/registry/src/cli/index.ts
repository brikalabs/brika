/**
 * CLI command dispatcher for registry-cli.
 */
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { add } from './commands/add';
import { edit } from './commands/edit';
import { inspect } from './commands/inspect';
import { keygen } from './commands/keygen';
import { list } from './commands/list';
import { remove } from './commands/remove';
import { sign } from './commands/sign';
import { verify } from './commands/verify';

export interface Command {
	name: string;
	description: string;
	run(args: string[]): Promise<void>;
}

const commands: Record<string, Command> = {
	keygen,
	add,
	remove,
	edit,
	sign,
	verify,
	list,
	inspect,
};

export function printAvailableCommands(): void {
	console.log(`\n${pc.bold('Available commands:')}\n`);
	for (const cmd of Object.values(commands)) {
		console.log(`  ${pc.cyan(cmd.name.padEnd(12))} ${pc.dim(cmd.description)}`);
	}
	console.log();
}

export async function runCommand(name: string, args: string[]): Promise<void> {
	const cmd = commands[name];
	if (!cmd) {
		p.log.error(`Unknown command: ${pc.bold(name)}`);
		printAvailableCommands();
		process.exit(1);
	}

	try {
		await cmd.run(args);
	} catch (error) {
		if (error instanceof Error && error.message === 'cancelled') {
			process.exit(0);
		}
		p.cancel('An unexpected error occurred.');
		console.error(error);
		process.exit(1);
	}
}
