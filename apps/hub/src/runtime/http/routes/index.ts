import { Scope } from '@brika/auth';
import { requireAuth, requireScope } from '@brika/auth/server';
import { combineRoutes, group } from '@brika/router';
import { actionRoutes } from './action-routes';
import { analyticsRoutes } from './analytics';
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
import { settingsAdminRoutes, settingsRoutes } from './settings';
import { hubSetupProtectedRoutes, hubSetupPublicRoutes } from './setup';
import { sparksRoutes } from './sparks';
import { healthRoute, systemRoute } from './status';
import { streamsRoutes } from './streams';
import {
  systemAdminRoutes,
  systemReadRoutes,
  updateAdminRoutes,
  updateReadRoutes,
} from './updates';
import { usersRoutes } from './users';
import { workflowsRoutes } from './workflows';

/**
 * All API routes combined.
 *
 * Public: health + i18n reads (bundles, namespaces, SSE event stream) +
 * the hub setup endpoints needed to bootstrap an unconfigured install.
 *
 * Authenticated: most read endpoints — including the update-status
 * check (`GET /api/system/update`) and the migration banner feed
 * (`GET /api/system/migrations`) — so a non-admin viewer still sees
 * the update badge.
 *
 * Admin-only (`Scope.ADMIN_ALL`):
 *   - i18n write surface (existing).
 *   - The compat report (`GET /api/system/update/compat`) — enumerates
 *     every installed plugin name, which is low-grade info disclosure
 *     on a multi-user hub.
 *   - Every action that mutates the hub binary or lifecycle:
 *     `POST /api/system/update/apply`, `POST /api/system/restart`,
 *     `POST /api/system/stop`.
 *
 * `settingsRoutes` stays under the authenticated group because most of
 * its endpoints (themes, hub location, timezone) are user-facing; the
 * update-channel + pinned-version PUTs inside it should be admin-only
 * but the file isn't split yet — tracked as a follow-up.
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
        routes: [i18nWriteRoutes, updateAdminRoutes, systemAdminRoutes, settingsAdminRoutes],
      }),
      oauthRoutes,
      pageRoutes,
      pluginRoutesHandler,
      pluginsRoutes,
      remoteAccessRoutes,
      sparksRoutes,
      workflowsRoutes,
      logsRoutes,
      analyticsRoutes,
      streamsRoutes,
      registryRoutes,
      settingsRoutes,
      updateReadRoutes,
      systemReadRoutes,
      usersRoutes,
    ],
  })
);
