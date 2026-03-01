#!/usr/bin/env bun
/**
 * BRIKA Hub Build Script
 *
 * Usage:
 *   bun run build                                           # Bundle (dev/Docker)
 *   bun run build --compile                                 # Standalone binary
 *   bun run build --compile --target=bun-linux-x64          # Cross-compile
 */
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    compile: {
      type: 'boolean',
      default: false,
    },
    target: {
      type: 'string',
    },
  },
  strict: false,
});

console.log();

if (values.compile) {
  const { compile } = await import('./compile');
  await compile(typeof values.target === 'string' ? values.target : undefined);
} else {
  const { bundle } = await import('./bundle');
  await bundle();
}

console.log();
