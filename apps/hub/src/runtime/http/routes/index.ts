import { combineRoutes } from '@elia/router';
import { blocksRoutes } from './blocks';
import { eventsRoutes } from './events';
import { healthRoutes } from './health';
import { i18nRoutes } from './i18n';
import { logsRoutes } from './logs';
import { pluginsRoutes } from './plugins';
import { registryRoutes } from './registry';
import { rulesRoutes } from './rules';
import { schedulesRoutes } from './schedules';
import { streamsRoutes } from './streams';
import { toolsRoutes } from './tools';
import { workflowsRoutes } from './workflows';

/**
 * All API routes combined.
 *
 * @example
 * ```ts
 * // Add a version prefix to all routes:
 * export const allRoutes = combineRoutes(
 *   { prefix: "/v1" },
 *   healthRoutes,
 *   toolsRoutes,
 *   // ...
 * );
 * ```
 */
export const allRoutes = combineRoutes(
  healthRoutes,
  toolsRoutes,
  blocksRoutes,
  pluginsRoutes,
  eventsRoutes,
  schedulesRoutes,
  rulesRoutes,
  workflowsRoutes,
  logsRoutes,
  streamsRoutes,
  i18nRoutes,
  registryRoutes
);
