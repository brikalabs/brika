import { combineRoutes, group } from '@brika/router';
import { requireAuth } from '@brika/auth/server';
import { actionRoutes } from './action-routes';
import { blocksRoutes } from './blocks';
import { boardsRoutes } from './boards';
import { bricksRoutes } from './bricks';
import { i18nRoutes } from './i18n';
import { logsRoutes } from './logs';
import { oauthRoutes } from './oauth';
import { pageRoutes } from './pages';
import { pluginRoutesHandler } from './plugin-routes';
import { pluginsRoutes } from './plugins';
import { registryRoutes } from './registry';
import { settingsRoutes } from './settings';
import { sparksRoutes } from './sparks';
import { healthRoute, systemRoute } from './status';
import { streamsRoutes } from './streams';
import { systemRoutes, updateRoutes } from './updates';
import { workflowsRoutes } from './workflows';

/**
 * All API routes combined.
 * Health and i18n are public; everything else requires authentication.
 */
export const allRoutes = combineRoutes(
  healthRoute,
  i18nRoutes,
  group({
    middleware: [requireAuth()],
    routes: [
      systemRoute,
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
      registryRoutes,
      settingsRoutes,
      updateRoutes,
      systemRoutes,
    ],
  }),
);
