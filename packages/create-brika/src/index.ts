/**
 * create-brika CLI
 *
 * Scaffold a new BRIKA plugin with a single command.
 *
 * Usage:
 *   bun create brika my-plugin
 *   bunx create-brika my-plugin
 */

import { parseArgs } from 'node:util';
import * as p from '@brika/cli/prompts';
import pc from 'picocolors';
import { runCreate } from './run';

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
    help: {
      type: 'boolean',
      short: 'h',
      default: false,
    },
    git: {
      type: 'boolean',
      default: true,
    },
    install: {
      type: 'boolean',
      default: true,
    },
  },
});

if (values.help) {
  console.log(HELP);
} else {
  try {
    await runCreate({
      name: positionals[0],
      git: values.git !== false,
      install: values.install !== false,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'cancelled') {
      process.exit(0);
    }
    p.cancel('An error occurred');
    console.error(error);
    process.exit(1);
  }
}
