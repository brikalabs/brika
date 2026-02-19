import { QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { TooltipProvider } from '@/components/ui';
import { queryClient } from '@/lib/query';

// Initialize i18n (side-effect import)
import '@/lib/i18n';

// Dashboard loads eagerly (landing page)
import { DashboardPage } from '@/features/dashboard';
// Layout (always loaded)
import { RootLayout } from '@/layout/RootLayout';

// Feature Pages — lazy loaded per route
const BlocksPage = lazy(() => import('@/features/blocks').then((m) => ({ default: m.BlocksPage })));
const BoardsLayout = lazy(() =>
  import('@/features/boards').then((m) => ({ default: m.BoardsLayout }))
);
const BoardContent = lazy(() =>
  import('@/features/boards').then((m) => ({ default: m.BoardContent }))
);
const SparksPage = lazy(() => import('@/features/events').then((m) => ({ default: m.SparksPage })));
const LogsPage = lazy(() => import('@/features/logs').then((m) => ({ default: m.LogsPage })));
const PluginsPage = lazy(() =>
  import('@/features/plugins').then((m) => ({ default: m.PluginsPage }))
);
const PluginDetailPage = lazy(() =>
  import('@/features/plugins').then((m) => ({ default: m.PluginDetailPage }))
);
const PluginOverviewTab = lazy(() =>
  import('@/features/plugins').then((m) => ({ default: m.PluginOverviewTab }))
);
const PluginPageTab = lazy(() =>
  import('@/features/plugins').then((m) => ({ default: m.PluginPageTab }))
);
const SettingsPage = lazy(() =>
  import('@/features/settings').then((m) => ({ default: m.SettingsPage }))
);
const StorePage = lazy(() => import('@/features/store').then((m) => ({ default: m.StorePage })));
const StorePluginDetailPage = lazy(() =>
  import('@/features/store').then((m) => ({ default: m.StorePluginDetailPage }))
);
const WorkflowsPage = lazy(() =>
  import('@/features/workflows').then((m) => ({ default: m.WorkflowsPage }))
);
const WorkflowEditorPage = lazy(() =>
  import('@/features/workflows').then((m) => ({ default: m.WorkflowEditorPage }))
);

import './index.css';

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

const rootRoute = createRootRoute({ component: RootLayout });

// Plugin detail routes — nested layout with Outlet
const pluginDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/plugins/$uid',
  component: PluginDetailPage,
});

const pluginOverviewRoute = createRoute({
  getParentRoute: () => pluginDetailRoute,
  path: '/',
  component: PluginOverviewTab,
});

const pluginPageRoute = createRoute({
  getParentRoute: () => pluginDetailRoute,
  path: '/$tab',
  component: PluginPageTab,
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

// Store plugin detail route — $source (npm|local) + splat for the package name (handles scoped @scope/pkg)
const storePluginDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/store/$source/$',
  component: StorePluginDetailPage,
});

// Boards routes — nested layout with Outlet
const boardsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/boards',
  component: BoardsLayout,
});

const boardDetailRoute = createRoute({
  getParentRoute: () => boardsRoute,
  path: '/$boardId',
  component: BoardContent,
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
  pluginDetailRoute.addChildren([pluginOverviewRoute, pluginPageRoute]),
  sparksRoute.addChildren([sparksTabRoute]),
  createRoute({ getParentRoute: () => rootRoute, path: '/workflows', component: WorkflowsPage }),
  workflowNewRoute,
  workflowEditorRoute,
  createRoute({ getParentRoute: () => rootRoute, path: '/blocks', component: BlocksPage }),
  boardsRoute.addChildren([boardDetailRoute]),
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
