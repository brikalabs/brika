#!/usr/bin/env bun

/**
 * create-brika CLI
 *
 * Scaffold a new BRIKA plugin with a single command.
 *
 * Usage:
 *   bun create brika my-plugin
 *   bunx create-brika my-plugin
 */

import * as p from '@clack/prompts';
import pc from 'picocolors';
import { parseArgs } from 'node:util';
import { promptForConfig } from './prompts';
import { scaffold } from './scaffold';

const HELP = `
${pc.bold('create-brika')} - Create a new BRIKA plugin

${pc.bold('Usage:')}
  ${pc.cyan('bun create brika')} ${pc.dim('[plugin-name]')} ${pc.dim('[options]')}

${pc.bold('Options:')}
  ${pc.cyan('-h, --help')}        Show this help message
  ${pc.cyan('--no-git')}          Skip git initialization
  ${pc.cyan('--no-install')}      Skip dependency installation

${pc.bold('Examples:')}
  ${pc.dim('# Interactive mode')}
  bun create brika

  ${pc.dim('# With plugin name')}
  bun create brika my-plugin

  ${pc.dim('# Skip git and install')}
  bun create brika my-plugin --no-git --no-install
`;

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  strict: false,
  options: {
    help: { type: 'boolean', short: 'h', default: false },
    git: { type: 'boolean', default: true },
    install: { type: 'boolean', default: true },
  },
});

if (values.help) {
  console.log(HELP);
} else {
  try {
    const config = await promptForConfig(positionals[0]);

    await scaffold({
      ...config,
      git: values.git !== false,
      install: values.install !== false,
    });

    const pluginPath = pc.cyan(`./${config.name}`);
    p.outro(`${pc.green('Success!')} Your plugin is ready at ${pluginPath}`);

    console.log();
    console.log(pc.bold('Next steps:'));
    console.log(`  ${pc.cyan('cd')} ${config.name}`);
    console.log(`  ${pc.cyan('bun')} link`);
    console.log();
  } catch (error) {
    if (error instanceof Error && error.message === 'cancelled') {
      process.exit(0);
    }
    p.cancel('An error occurred');
    console.error(error);
    process.exit(1);
  }
}
