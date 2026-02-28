// Required for tsyringe DI
import 'reflect-metadata';

import {
  BoardsLoader,
  bootstrap,
  cache,
  I18nLoader,
  loader,
  PluginLoader,
  processGuard,
  routes,
  sparks,
  trapSignals,
  updates,
  WorkflowsLoader,
} from '@/runtime/bootstrap';
import { inject } from '@brika/di';
import { auth } from '@brika/auth/server';
import { allRoutes } from '@/runtime/http/routes';
import { ApiServer } from '@/runtime/http/api-server';
import { dataDir } from '@/cli/utils/runtime';

/**
 * BRIKA Hub Entry Point
 *
 * Declarative bootstrap with modular plugins.
 */
await bootstrap()
  .use(processGuard())
  .use(cache())
  .use(auth({ dataDir, server: inject(ApiServer) }))
  .use(sparks())
  .use(routes(allRoutes))
  .use(loader(I18nLoader))
  .use(loader(PluginLoader))
  .use(loader(WorkflowsLoader))
  .use(loader(BoardsLoader))
  .use(updates())
  .use(trapSignals())
  .start();
