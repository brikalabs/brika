import { combineRoutes } from '@brika/router';
import { blocksRoutes } from './blocks';
import { healthRoutes } from './health';
import { i18nRoutes } from './i18n';
import { logsRoutes } from './logs';
import { pluginsRoutes } from './plugins';
import { registryRoutes } from './registry';
import { sparksRoutes } from './sparks';
import { streamsRoutes } from './streams';
import { workflowsRoutes } from './workflows';

/**
 * All API routes combined.
 */
export const allRoutes = combineRoutes(
  healthRoutes,
  blocksRoutes,
  pluginsRoutes,
  sparksRoutes,
  workflowsRoutes,
  logsRoutes,
  streamsRoutes,
  i18nRoutes,
  registryRoutes
);
