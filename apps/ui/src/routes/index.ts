import { createProtectedRoutes } from '@brika/auth/tanstack';
import { createRootRoute } from '@tanstack/react-router';
import { ForbiddenPage } from '@/components/errors';
import { RootLayout } from '@/layout/RootLayout';
import { adminRoutes } from './admin';
import { authRoutes } from './auth';
import { blockRoutes } from './blocks';
import { boardRoutes } from './boards';
import { dashboardRoutes } from './dashboard';
import { logRoutes } from './logs';
import { pluginRoutes } from './plugins';
import { settingRoutes } from './settings';
import { setupRoutes } from './setup';
import { sparkRoutes } from './sparks';
import { storeRoutes } from './store';
import { workflowRoutes } from './workflows';

export const rootRoute = createRootRoute({
  component: RootLayout,
});

export const { routes, routeTree } = createProtectedRoutes(
  rootRoute,
  {
    dashboard: dashboardRoutes,
    blocks: blockRoutes,
    plugins: pluginRoutes,
    workflows: workflowRoutes,
    boards: boardRoutes,
    sparks: sparkRoutes,
    logs: logRoutes,
    store: storeRoutes,
    settings: settingRoutes,
    admin: adminRoutes,
    auth: authRoutes,
    setup: setupRoutes,
  },
  {
    defaultForbiddenComponent: ForbiddenPage,
  }
);
