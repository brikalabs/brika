import { QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { TooltipProvider } from '@/components/ui';
import { queryClient } from '@/lib/query';

// Initialize i18n (side-effect import)
import '@/lib/i18n';

// Feature Pages
import { BlocksPage } from '@/features/blocks';
import { BricksLayout, DashboardContent } from '@/features/bricks';
import { DashboardPage } from '@/features/dashboard';
import { SparksPage } from '@/features/events';
import { LogsPage } from '@/features/logs';
import { PluginDetailPage, PluginsPage } from '@/features/plugins';
import { SettingsPage } from '@/features/settings';
import { StorePage, StorePluginDetailPage } from '@/features/store';
import { WorkflowEditorPage, WorkflowsPage } from '@/features/workflows';
// Layout
import { RootLayout } from '@/layout/RootLayout';

import './index.css';

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

const rootRoute = createRootRoute({ component: RootLayout });

// Plugin detail route with typed params
const pluginDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/plugins/$uid',
  component: PluginDetailPage,
});

// Workflow routes
const workflowEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workflows/$id/edit',
  component: WorkflowEditorPage,
});

const workflowNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workflows/new',
  component: WorkflowEditorPage,
});

// Store plugin detail route
const storePluginDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/store/$name',
  component: StorePluginDetailPage,
});

// Bricks routes — nested layout with Outlet
const bricksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/bricks',
  component: BricksLayout,
});

const bricksDashboardRoute = createRoute({
  getParentRoute: () => bricksRoute,
  path: '/$dashboardId',
  component: DashboardContent,
});

// Sparks routes with tab parameter
const sparksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sparks',
  component: SparksPage,
});

const sparksTabRoute = createRoute({
  getParentRoute: () => sparksRoute,
  path: '/$tab',
  component: SparksPage,
});

const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: DashboardPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/plugins', component: PluginsPage }),
  pluginDetailRoute,
  sparksRoute.addChildren([sparksTabRoute]),
  createRoute({ getParentRoute: () => rootRoute, path: '/workflows', component: WorkflowsPage }),
  workflowNewRoute,
  workflowEditorRoute,
  createRoute({ getParentRoute: () => rootRoute, path: '/blocks', component: BlocksPage }),
  bricksRoute.addChildren([bricksDashboardRoute]),
  createRoute({ getParentRoute: () => rootRoute, path: '/logs', component: LogsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/store', component: StorePage }),
  storePluginDetailRoute,
  createRoute({ getParentRoute: () => rootRoute, path: '/settings', component: SettingsPage }),
];

const router = createRouter({ routeTree: rootRoute.addChildren(routes) });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mount
// ─────────────────────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense
      fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
    </Suspense>
  </React.StrictMode>
);
