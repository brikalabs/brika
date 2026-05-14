/**
 * Section table for the unified brika TUI. Each entry is a top-level
 * area accessible from the sidebar; sub-screens (plugin detail, user
 * edit, etc.) are managed by the section view's own internal state.
 */

import { defineRoute, type RoutesShape } from '@brika/tui';
import { DashboardView } from './views/DashboardView';
import { HelpView } from './views/HelpView';
import { LogsView } from './views/LogsView';
import { PlaygroundView } from './views/PlaygroundView';
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
  playground: defineRoute({ component: PlaygroundView }),
  help: defineRoute({ component: HelpView }),
} as const satisfies RoutesShape;

export type Routes = typeof routes;

/**
 * Sidebar-visible sections in render order. `help` is reached via `?`
 * rather than from the sidebar so we keep the main list focused on
 * "things you do" instead of "things you learn".
 */
export interface SectionEntry {
  readonly key: keyof Routes;
  readonly label: string;
  /** Single-letter hotkey to jump straight here. */
  readonly hotkey: string;
}

export const SIDEBAR_SECTIONS: ReadonlyArray<SectionEntry> = [
  { key: 'dashboard', label: 'Dashboard', hotkey: 'd' },
  { key: 'plugins', label: 'Plugins', hotkey: 'p' },
  { key: 'workflows', label: 'Workflows', hotkey: 'w' },
  { key: 'logs', label: 'Logs', hotkey: 'l' },
  { key: 'users', label: 'Users', hotkey: 'u' },
  { key: 'updates', label: 'Updates', hotkey: 'g' },
  { key: 'settings', label: 'Settings', hotkey: ',' },
  { key: 'playground', label: 'Playground', hotkey: 'x' },
];
