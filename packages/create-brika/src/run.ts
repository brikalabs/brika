/**
 * The scaffold orchestration, shared by the `create-brika` bin (`bun create
 * brika`) and the `brika create` CLI command. Prompts for any missing config,
 * writes the plugin, and prints next steps.
 */

import * as p from '@brika/cli/prompts';
import pc from 'picocolors';
import { promptForConfig } from './prompts';
import { scaffold } from './scaffold';

export interface CreateOptions {
  /** Plugin name; prompted for when omitted. */
  name?: string;
  /** Initialize a git repo (default: true). */
  git?: boolean;
  /** Install dependencies (default: true). */
  install?: boolean;
}

/** Scaffold a new BRIKA plugin. Throws Error('cancelled') if the user aborts. */
export async function runCreate(opts: CreateOptions = {}): Promise<void> {
  const config = await promptForConfig(opts.name);

  await scaffold({
    ...config,
    git: opts.git !== false,
    install: opts.install !== false,
  });

  p.outro(`${pc.green('Success!')} Your plugin is ready at ${pc.cyan(`./${config.name}`)}`);

  console.log();
  console.log(pc.bold('Next steps:'));
  console.log(`  ${pc.cyan('cd')} ${config.name}`);
  console.log(
    `  ${pc.cyan('brika dev')}   ${pc.dim('# build + load into your hub, hot-reload on edits')}`
  );
  console.log();
}
