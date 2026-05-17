/**
 * Section table for the unified brika TUI. Each entry is a top-level
 * area accessible from the sidebar; sub-screens (plugin detail, user
 * edit, etc.) are managed by the section view's own internal state.
 */

import { defineRoute, type RoutesShape } from '@brika/tui';
import { BrixView } from './features/brix';
import { DashboardView } from './features/dashboard';
import { HelpView } from './features/help';
import { LogsView } from './features/logs';
import { InstalledTab, PluginsView, SearchTab } from './features/plugins';
import { SettingsView } from './features/settings';
import { UpdatesView } from './features/updates';
import { UsersView } from './features/users';
import { WorkflowsView } from './features/workflows';

export const routes = {
  dashboard: defineRoute({ component: DashboardView }),
  plugins: defineRoute({
    component: PluginsView,
    children: {
      installed: defineRoute({ component: InstalledTab }),
      search: defineRoute({ component: SearchTab }),
    },
  }),
  workflows: defineRoute({ component: WorkflowsView }),
  logs: defineRoute({ component: LogsView }),
  users: defineRoute({ component: UsersView }),
  updates: defineRoute({ component: UpdatesView }),
  settings: defineRoute({ component: SettingsView }),
  brix: defineRoute({ component: BrixView }),
  help: defineRoute({ component: HelpView }),
} as const satisfies RoutesShape;

export type Routes = typeof routes;
