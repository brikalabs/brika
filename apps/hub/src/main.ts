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
import { allRoutes } from '@/runtime/http/routes';

/**
 * BRIKA Hub Entry Point
 *
 * Declarative bootstrap with modular plugins.
 */
await bootstrap()
  .use(processGuard()) // Kill orphan plugins from previous crash; guard current ones
  .use(cache()) // Initialize SQLite cache before loaders
  .use(sparks())
  .use(routes(allRoutes))
  .use(loader(I18nLoader))
  .use(loader(PluginLoader))
  .use(loader(WorkflowsLoader))
  .use(loader(BoardsLoader))
  .use(updates())
  .use(trapSignals())
  .start();
