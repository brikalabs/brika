import { Scope } from '@brika/auth';
import { requireAuth, requireScope } from '@brika/auth/server';
import { combineRoutes, group } from '@brika/router';
import { actionRoutes } from './action-routes';
import { blocksRoutes } from './blocks';
import { boardsRoutes } from './boards';
import { bricksRoutes } from './bricks';
import { i18nRoutes, i18nWriteRoutes } from './i18n';
import { logsRoutes } from './logs';
import { oauthRoutes } from './oauth';
import { pageRoutes } from './pages';
import { pluginRoutesHandler } from './plugin-routes';
import { pluginsRoutes } from './plugins';
import { registryRoutes } from './registry';
import { remoteAccessRoutes } from './remote-access';
import { settingsRoutes } from './settings';
import { hubSetupProtectedRoutes, hubSetupPublicRoutes } from './setup';
import { sparksRoutes } from './sparks';
import { healthRoute, systemRoute } from './status';
import { streamsRoutes } from './streams';
import { systemRoutes, updateRoutes } from './updates';
import { usersRoutes } from './users';
import { workflowsRoutes } from './workflows';

/**
 * All API routes combined.
 *
 * Public: health + i18n reads (bundles, namespaces, SSE event stream) +
 * the hub setup endpoints needed to bootstrap an unconfigured install.
 *
 * Authenticated: everything else.
 *
 * Admin-only: the i18n write surface (`GET /api/i18n/sources`,
 * `POST /api/i18n/sources/:ns/:locale`). Source-file disclosure and
 * translation edits are gated by `Scope.ADMIN_ALL` so a low-privilege
 * account on a multi-user hub can't read filesystem paths or mutate
 * JSON files; auth alone isn't enough.
 */
export const allRoutes = combineRoutes(
  healthRoute,
  i18nRoutes,
  hubSetupPublicRoutes,
  group({
    middleware: [requireAuth()],
    routes: [
      hubSetupProtectedRoutes,
      systemRoute,
      actionRoutes,
      blocksRoutes,
      bricksRoutes,
      boardsRoutes,
      group({
        middleware: [requireScope(Scope.ADMIN_ALL)],
        routes: [i18nWriteRoutes],
      }),
      oauthRoutes,
      pageRoutes,
      pluginRoutesHandler,
      pluginsRoutes,
      remoteAccessRoutes,
      sparksRoutes,
      workflowsRoutes,
      logsRoutes,
      streamsRoutes,
      registryRoutes,
      settingsRoutes,
      updateRoutes,
      systemRoutes,
      usersRoutes,
    ],
  })
);
