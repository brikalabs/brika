#!/usr/bin/env bun
/**
 * Brika CLI entry point.
 *
 * `--cwd` / `-C` must be parsed before any imports so that
 * module-level path resolution (BRIKA_HOME, PID file) picks up
 * the overridden directory.
 *
 * `reflect-metadata` is loaded first because the bundled binary
 * statically pulls in `@brika/hub`, and the hub's DI container
 * (tsyringe) evaluates `@injectable` / `@inject` decorators at module
 * load — they fail loudly without the polyfill in scope.
 */

import 'reflect-metadata';

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

// `--self-check` is the staged-install validation probe spawned by the
// orchestrator on the *new* binary at `brika.next`. It must short-circuit
// before any heavy module loads so a broken sandbox / DI / DB layer in
// the new binary can't masquerade as a passing self-check. The handler
// in `@brika/hub/self-check` writes one JSON line to stdout and exits.
if (process.argv.includes('--self-check')) {
  const { runSelfCheckAndExit } = await import('@brika/hub/self-check');
  runSelfCheckAndExit();
}

const cwd = extractCwd(process.argv);
if (cwd) {
  process.env.BRIKA_HOME = cwd;
}

const { cli } = await import('./commands');
await cli.run();
