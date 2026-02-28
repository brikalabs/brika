import { createRootRoute } from '@tanstack/react-router';
import { createProtectedRoutes } from '@brika/auth/tanstack';
import { RootLayout } from '@/layout/RootLayout';
import { ForbiddenPage } from '@/components/errors';
import { dashboardRoutes } from './dashboard';
import { blockRoutes } from './blocks';
import { pluginRoutes } from './plugins';
import { workflowRoutes } from './workflows';
import { boardRoutes } from './boards';
import { sparkRoutes } from './sparks';
import { logRoutes } from './logs';
import { storeRoutes } from './store';
import { settingRoutes } from './settings';
import { adminRoutes } from './admin';
import { authRoutes } from './auth';

export const rootRoute = createRootRoute({ component: RootLayout });

export const { routes, routeTree } = createProtectedRoutes(rootRoute, {
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
}, {
  defaultForbiddenComponent: ForbiddenPage,
});
