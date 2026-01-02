import React from "react";
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

// Plugin detail route with typed params
const pluginDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/plugins/$uid",
  component: PluginDetailWrapper,
});

// Use getRouteApi to access typed params in the component
const pluginDetailApi = getRouteApi("/plugins/$uid");

function PluginDetailWrapper() {
  const { uid } = pluginDetailApi.useParams();
  return <PluginDetailPage pluginUid={uid} />;
}

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
