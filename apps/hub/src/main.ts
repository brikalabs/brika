// Required for tsyringe DI
import 'reflect-metadata';

import { auth } from '@brika/auth/server';
import { inject } from '@brika/di';
import { makeCliTokenResolver } from '@/cli/utils/cli-session';
import { readCliToken } from '@/cli/utils/cli-token';
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

// Local-trust token written by the supervisor (`runSupervisor`) so the
// CLI on the same machine can authenticate as admin without a login.
// Absent when the hub is launched outside the supervisor — in that
// case the resolver stays unset and every request falls through to
// normal session validation.
const cliToken = readCliToken();

/**
 * BRIKA Hub Entry Point
 *
 * Declarative bootstrap with modular plugins.
 */
await bootstrap()
  .use(processGuard())
  .use(cache())
  .use(
    auth({
      server: inject(ApiServer),
      config: cliToken ? { staticTokenResolver: makeCliTokenResolver(cliToken) } : undefined,
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
