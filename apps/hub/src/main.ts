// Required for tsyringe DI
import 'reflect-metadata';

import {
  bootstrap,
  cache,
  BoardsLoader,
  I18nLoader,
  loader,
  PluginLoader,
  routes,
  sparks,
  trapSignals,
  WorkflowsLoader,
} from '@/runtime/bootstrap';
import { allRoutes } from '@/runtime/http/routes';

/**
 * BRIKA Hub Entry Point
 *
 * Declarative bootstrap with modular plugins.
 */
await bootstrap()
  .use(cache()) // Initialize SQLite cache early
  .use(sparks())
  .use(routes(allRoutes))
  .use(loader(I18nLoader))
  .use(loader(PluginLoader))
  .use(loader(WorkflowsLoader))
  .use(loader(BoardsLoader))
  .use(trapSignals())
  .start();
