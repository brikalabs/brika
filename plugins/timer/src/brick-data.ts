/**
 * Typed brick-data channel for the timer dashboard brick. Declared once and
 * imported by both the plugin process (index.tsx, `.set(...)`) and the client
 * view (timers-dashboard.tsx, `.use()`).
 */

import { defineBrickData } from '@brika/sdk/brick-views';

export interface DashboardData {
  blockCount: number;
  sparkCount: number;
  startedAt: number;
}

export const dashboardData = defineBrickData<DashboardData>('timers-dashboard');
