#!/usr/bin/env bun

/**
 * registry-cli — Interactive registry management for Brika verified plugins.
 *
 * Usage:
 *   bun cli.ts <command> [args]
 *
 * Commands:
 *   keygen    Generate Ed25519 key pair for signing
 *   add       Add a plugin to the registry
 *   remove    Remove plugin(s) from the registry
 *   edit      Edit a plugin entry
 *   sign      Re-sign the entire registry
 *   verify    Verify all signatures
 *   list      List all plugins
 *   inspect   Show detailed info for a plugin
 */

import { parseArgs } from 'node:util';
import pc from 'picocolors';
import { runCommand } from './src/cli/index';

const HELP = `
${pc.bold('registry-cli')} — Brika Verified Plugins Registry Manager

${pc.bold('Usage:')}
  ${pc.cyan('bun cli.ts <command>')} ${pc.dim('[args]')}

${pc.bold('Commands:')}
  ${pc.cyan('keygen')}    Generate Ed25519 key pair for signing
  ${pc.cyan('add')}       Add a plugin to the registry (auto-signs)
  ${pc.cyan('remove')}    Remove plugin(s) from the registry (auto-signs)
  ${pc.cyan('edit')}      Edit a plugin entry (auto-signs)
  ${pc.cyan('sign')}      Re-sign the entire registry manually
  ${pc.cyan('verify')}    Verify all signatures
  ${pc.cyan('list')}      List all plugins
  ${pc.cyan('inspect')}   Show detailed info for a plugin

${pc.bold('Examples:')}
  bun cli.ts keygen
  bun cli.ts add
  bun cli.ts list
  bun cli.ts verify
  bun cli.ts inspect @brika/blocks-builtin
`;

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  strict: false,
  options: {
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help || positionals.length === 0) {
  console.log(HELP);
  process.exit(0);
}

await runCommand(positionals[0], positionals.slice(1));
