import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter, createRootRoute, createRoute } from "@tanstack/react-router";
import { TooltipProvider } from "@/components/ui";
import { queryClient } from "@/lib/query";

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

import "./index.css";

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

const rootRoute = createRootRoute({ component: RootLayout });

// Wrapper component for plugin detail with route params
function PluginDetailWrapper() {
  const { pluginId } = (window as unknown as { __routeParams?: { pluginId: string } }).__routeParams || {};
  // Get pluginId from URL manually since we're not using file-based routing
  const id = decodeURIComponent(window.location.pathname.split("/plugins/")[1] || "");
  return <PluginDetailPage pluginId={id} />;
}

const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: "/", component: DashboardPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/plugins", component: PluginsPage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: "/plugins/$pluginId",
    component: PluginDetailWrapper,
  }),
  createRoute({ getParentRoute: () => rootRoute, path: "/tools", component: ToolsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/events", component: EventsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/workflows", component: WorkflowsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/schedules", component: SchedulesPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/rules", component: RulesPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/logs", component: LogsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: "/store", component: StorePage }),
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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
