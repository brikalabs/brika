// Required for tsyringe DI
import 'reflect-metadata';

import {
  AutomationLoader,
  bootstrap,
  I18nLoader,
  loader,
  PluginLoader,
  RuleLoader,
  routes,
  ScheduleLoader,
  trapSignals,
} from '@/runtime/bootstrap';
import { allRoutes } from '@/runtime/http/routes';

/**
 * BRIKA Hub Entry Point
 *
 * Declarative bootstrap with modular plugins.
 */
await bootstrap()
  .use(routes(allRoutes))
  .use(loader(I18nLoader))
  .use(loader(PluginLoader))
  .use(loader(RuleLoader))
  .use(loader(ScheduleLoader))
  .use(loader(AutomationLoader))
  .use(trapSignals())
  .start();
