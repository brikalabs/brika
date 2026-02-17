import { combineRoutes } from '@brika/router';
import { actionRoutes } from './action-routes';
import { blocksRoutes } from './blocks';
import { bricksRoutes } from './bricks';
import { boardsRoutes } from './boards';
import { i18nRoutes } from './i18n';
import { logsRoutes } from './logs';
import { oauthRoutes } from './oauth';
import { pageRoutes } from './pages';
import { pluginRoutesHandler } from './plugin-routes';
import { pluginsRoutes } from './plugins';
import { registryRoutes } from './registry';
import { sparksRoutes } from './sparks';
import { statusRoutes } from './status';
import { streamsRoutes } from './streams';
import { workflowsRoutes } from './workflows';
import { settingsRoutes } from './settings';

/**
 * All API routes combined.
 */
export const allRoutes = combineRoutes(
  statusRoutes,
  actionRoutes,
  blocksRoutes,
  bricksRoutes,
  boardsRoutes,
  oauthRoutes,
  pageRoutes,
  pluginRoutesHandler,
  pluginsRoutes,
  sparksRoutes,
  workflowsRoutes,
  logsRoutes,
  streamsRoutes,
  i18nRoutes,
  registryRoutes,
  settingsRoutes
);
