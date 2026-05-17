#!/usr/bin/env bun
/**
 * BRIKA Build CLI
 *
 * Usage:
 *   bun --filter @brika/build build                                  # bundle the `full` target
 *   bun --filter @brika/build build --compile                        # compile to a standalone binary
 *   bun --filter @brika/build build --target=headless --compile      # compile the headless hub
 *   bun --filter @brika/build build --compile --platform=bun-linux-x64
 *   bun --filter @brika/build build --list                           # show available targets
 */

import { parseArgs } from 'node:util';
import pc from 'picocolors';
import { log } from './log';
import { getTarget, PLATFORMS, TARGETS } from './targets';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    compile: {
      type: 'boolean',
      default: false,
    },
    target: {
      type: 'string',
      default: 'full',
    },
    platform: {
      type: 'string',
    },
    list: {
      type: 'boolean',
      default: false,
    },
  },
  strict: false,
});

console.log();

if (values.list) {
  log(pc.bold('Available build targets'));
  console.log();
  for (const target of Object.values(TARGETS)) {
    log(`${pc.cyan(target.name.padEnd(10))} ${target.description}`);
    log(pc.dim(`           entry: ${target.entrypoint}  →  ${target.binaryName}`));
  }
  console.log();
  log(pc.dim(`Platforms (--platform=<value>): ${PLATFORMS.join(', ')}`));
  console.log();
  process.exit(0);
}

const targetName = typeof values.target === 'string' ? values.target : 'full';
const target = getTarget(targetName);

if (values.compile) {
  const { compile } = await import('./compile');
  await compile({
    target,
    platform: typeof values.platform === 'string' ? values.platform : undefined,
  });
} else {
  const { bundle } = await import('./bundle');
  await bundle(target);
}

console.log();
