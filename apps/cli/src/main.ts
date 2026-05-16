#!/usr/bin/env bun
/**
 * Brika CLI entry point.
 *
 * `--cwd` / `-C` must be parsed before any imports so that
 * module-level path resolution (BRIKA_HOME, PID file) picks up
 * the overridden directory.
 */

function extractCwd(argv: string[]): string | undefined {
  for (const flag of ['--cwd', '-C']) {
    const idx = argv.indexOf(flag);
    if (idx === -1) {
      continue;
    }
    const value = argv[idx + 1];
    if (!value || value.startsWith('-')) {
      console.error(`Error: ${flag} requires a path argument`);
      process.exit(1);
    }
    return value;
  }
}

async function main(): Promise<void> {
  const cwd = extractCwd(process.argv);
  if (cwd) {
    process.env.BRIKA_HOME = cwd;
  }
  const { cli } = await import('./commands');
  await cli.run();
}

void main();
