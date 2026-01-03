import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createRouter,
  createRootRoute,
  createRoute,
  getRouteApi,
} from "@tanstack/react-router";
import { TooltipProvider } from "@/components/ui";
import { queryClient } from "@/lib/query";

// Initialize i18n (side-effect import)
import "@/lib/i18n";

// Layout
import { RootLayout } from "@/layout/RootLayout";

// Feature Pages
import { DashboardPage } from "@/features/dashboard";
import { PluginsPage, PluginDetailPage } from "@/features/plugins";
import { ToolsPage } from "@/features/tools";
import { EventsPage } from "@/features/events";
import { SchedulesPage } from "@/features/schedules";
import { RulesPage } from "@/features/rules";
import { LogsPage } from "@/features/logs";
import { StorePage } from "@/features/store";
import { WorkflowsPage } from "@/features/workflows";
import { SettingsPage } from "@/features/settings";

import "./index.css";

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

const rootRoute = createRootRoute({ component: RootLayout });

// Plugin detail route with typed params
const pluginDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/plugins/$uid",
  component: PluginDetailPage,
});

const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: DashboardPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/plugins", component: PluginsPage }),
  pluginDetailRoute,
  createRoute({ getParentRoute: () => rootRoute, path: "/tools", component: ToolsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/events", component: EventsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/workflows", component: WorkflowsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/schedules", component: SchedulesPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/rules", component: RulesPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/logs", component: LogsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/store", component: StorePage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: SettingsPage }),
];

const router = createRouter({ routeTree: rootRoute.addChildren(routes) });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mount
// ─────────────────────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
    </Suspense>
  </React.StrictMode>,
);
