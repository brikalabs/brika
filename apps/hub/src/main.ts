// Required for tsyringe DI
import 'reflect-metadata';

import { auth } from '@brika/auth/server';
import { inject } from '@brika/di';
import { makeCliTokenResolver } from '@/auth/cli-session';
import { readCliToken, writeCliToken } from '@/auth/cli-token';
import {
  BoardsLoader,
  bootstrap,
  cache,
  I18nLoader,
  loader,
  PluginLoader,
  processGuard,
  remoteAccess,
  routes,
  sparks,
  trapSignals,
  updates,
  WorkflowsLoader,
} from '@/runtime/bootstrap';
import { ApiServer } from '@/runtime/http/api-server';
import { allRoutes } from '@/runtime/http/routes';

/**
 * BRIKA Hub Entry Point
 *
 * Declarative bootstrap with modular plugins.
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
if (!readCliToken()) {
  writeCliToken();
}

await bootstrap()
  .use(processGuard())
  .use(cache())
  .use(
    auth({
      server: inject(ApiServer),
      config: { staticTokenResolver: makeCliTokenResolver() },
    })
  )
  .use(sparks())
  .use(routes(allRoutes))
  .use(loader(I18nLoader))
  .use(loader(PluginLoader))
  .use(loader(WorkflowsLoader))
  .use(loader(BoardsLoader))
  .use(updates())
  .use(remoteAccess())
  .use(trapSignals())
  .start();
