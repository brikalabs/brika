/**
 * Declarative route table for the CLI's TUI. Mirrors mortar's pattern:
 * each route maps a name to a self-contained component, and adding a
 * screen is one entry here plus one file under `views/`.
 */

import { defineRoute, type RoutesShape } from '@brika/tui';
import { DashboardView } from './views/DashboardView';

export const routes = {
  dashboard: defineRoute({ component: DashboardView }),
} as const satisfies RoutesShape;

export type Routes = typeof routes;
