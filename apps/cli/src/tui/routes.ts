/**
 * Section table for the unified brika TUI. Each entry is a top-level
 * area accessible from the sidebar; sub-screens (plugin detail, user
 * edit, etc.) are managed by the section view's own internal state.
 */

import { defineRoute, type RoutesShape } from '@brika/tui';
import { BrixView } from './views/BrixView';
import { DashboardView } from './views/DashboardView';
import { HelpView } from './views/HelpView';
import { LogsView } from './views/LogsView';
import { PluginsView } from './views/PluginsView';
import { SettingsView } from './views/SettingsView';
import { UpdatesView } from './views/UpdatesView';
import { UsersView } from './views/UsersView';
import { WorkflowsView } from './views/WorkflowsView';

export const routes = {
  dashboard: defineRoute({ component: DashboardView }),
  plugins: defineRoute({ component: PluginsView }),
  workflows: defineRoute({ component: WorkflowsView }),
  logs: defineRoute({ component: LogsView }),
  users: defineRoute({ component: UsersView }),
  updates: defineRoute({ component: UpdatesView }),
  settings: defineRoute({ component: SettingsView }),
  brix: defineRoute({ component: BrixView }),
  help: defineRoute({ component: HelpView }),
} as const satisfies RoutesShape;

export type Routes = typeof routes;
