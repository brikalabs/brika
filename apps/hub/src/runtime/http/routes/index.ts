import { combineRoutes } from '@brika/router';
import { blocksRoutes } from './blocks';
import { bricksRoutes } from './bricks';
import { dashboardsRoutes } from './dashboards';
import { i18nRoutes } from './i18n';
import { logsRoutes } from './logs';
import { oauthRoutes } from './oauth';
import { pluginRoutesHandler } from './plugin-routes';
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
  bricksRoutes,
  dashboardsRoutes,
  oauthRoutes,
  pluginRoutesHandler,
  pluginsRoutes,
  sparksRoutes,
  workflowsRoutes,
  logsRoutes,
  streamsRoutes,
  i18nRoutes,
  registryRoutes,
);
