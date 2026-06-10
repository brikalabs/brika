// Required for tsyringe DI
import 'reflect-metadata';

import { auth } from '@brika/auth/server';
import { inject } from '@brika/di';
import { makeCliTokenResolver } from './auth/cli-session';
import { readCliToken, writeCliToken } from './auth/cli-token';
import {
  BoardsLoader,
  bootstrap,
  cache,
  crashHandlers,
  I18nLoader,
  loader,
  migrations,
  PluginLoader,
  processGuard,
  remoteAccess,
  routes,
  sparks,
  trapSignals,
  updates,
  WorkflowsLoader,
  workflowRuns,
} from './runtime/bootstrap';
import { ApiServer } from './runtime/http/api-server';
import { allRoutes } from './runtime/http/routes';
import { rollbackIfPreviousBootCrashed } from './runtime/updates/boot-rollback';
import { UpdateOrchestrator } from './runtime/updates/orchestrator';

/**
 * BRIKA Hub Entry Point
 *
 * Declarative bootstrap with modular plugins. Exposed as `startHub()`
 * so the unified `brika` CLI binary can call it inline from
 * `apps/console/src/commands/hub.ts` — the same chain also runs as a
 * standalone module entry (`bun run apps/hub/src/main.ts`) for hub-only
 * development.
 *
 * The local-trust CLI resolver is always installed: it reads
 * `${BRIKA_HOME}/cli-token` on every request and returns `null` when
 * the file is missing. That way a hub started without a supervisor
 * still works (no resolver hit, normal auth), and a token written
 * after boot (e.g. by a new supervisor that took over) becomes
 * recognised on the next request without a restart.
 *
 * If no token file exists at boot (developer started the hub directly
 * with `bun run dev:hub` instead of via the supervisor), write one
 * here so the CLI's local-trust path still works. A pre-existing
 * supervisor-issued token is left untouched.
 */
export async function startHub(): Promise<void> {
  // Boot-rollback FIRST — must run before anything that could itself
  // crash (DI, DB open, plugin load). If the previous boot recorded
  // an attempt without a matching success AND a `brika.previous`
  // backup exists on disk, this swaps the live binary for the backup
  // and exits with RESTART_CODE so the supervisor restarts us on the
  // known-good version. No-op on dev / container / system-package.
  rollbackIfPreviousBootCrashed();

  // Record the boot attempt **here**, not in the `updates()` plugin's
  // `onInit`. The plugin is `.use()`'d after every loader, so its
  // onInit runs last — a crash in any earlier loader would never reach
  // it and the next boot's `previousBootCrashed()` would miss the
  // signal. Doing it at the entry point covers every later failure
  // mode.
  inject(UpdateOrchestrator).recordBootAttempt();

  if (!readCliToken()) {
    writeCliToken();
  }

  await bootstrap()
    // Crash handlers first: a top-level uncaughtException /
    // unhandledRejection anywhere in the boot lifecycle should be logged
    // and turned into a clean RESTART_CODE exit, not a wedged process.
    .use(crashHandlers())
    .use(processGuard())
    .use(cache())
    .use(
      auth({
        server: inject(ApiServer),
        config: { staticTokenResolver: makeCliTokenResolver() },
      })
    )
    .use(sparks())
    // Subscribe run persistence before any loader so workflows that auto-start
    // on boot have their first run recorded.
    .use(workflowRuns())
    .use(routes(allRoutes))
    // Migrations run before any loader so filesystem reshapes
    // (plugin-data prune, future secrets re-encryption) don't race
    // with plugin loaders reading those paths.
    .use(migrations())
    .use(loader(I18nLoader))
    .use(loader(PluginLoader))
    .use(loader(WorkflowsLoader))
    .use(loader(BoardsLoader))
    .use(updates())
    .use(remoteAccess())
    .use(trapSignals())
    .start();
}

if (import.meta.main) {
  try {
    await startHub();
  } catch (error) {
    // A fatal bootstrap plugin (e.g. the API port is held by another hub)
    // already logged the abort; exit cleanly instead of re-crashing through
    // the uncaught-exception handler.
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
