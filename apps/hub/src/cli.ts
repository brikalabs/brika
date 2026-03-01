#!/usr/bin/env bun
/**
 * BRIKA CLI Entry Point
 *
 * Global --cwd / -C must be parsed before any imports so that
 * module-level constants (dataDir, PID_FILE, DB_PATH) pick up
 * the overridden BRIKA_HOME at evaluation time.
 */
function extractCwd(argv: string[]): string | undefined {
  for (const flag of [
    '--cwd',
    '-C',
  ]) {
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

const cwd = extractCwd(process.argv);
if (cwd) {
  process.env.BRIKA_HOME = cwd;
}

await import('reflect-metadata');
const { cli } = await import('./cli/commands');
cli.run();
