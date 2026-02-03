import { combineRoutes } from '@brika/router';
import { blocksRoutes } from './blocks';
import { i18nRoutes } from './i18n';
import { logsRoutes } from './logs';
import { pluginsRoutes } from './plugins';
import { registryRoutes } from './registry';
import { sparksRoutes } from './sparks';
import { statusRoutes } from './status';
import { streamsRoutes } from './streams';
import { workflowsRoutes } from './workflows';

/**
 * All API routes combined.
 */
export const allRoutes = combineRoutes(
  statusRoutes,
  blocksRoutes,
  pluginsRoutes,
  sparksRoutes,
  workflowsRoutes,
  logsRoutes,
  streamsRoutes,
  i18nRoutes,
  registryRoutes
);
