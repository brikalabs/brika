/**
 * Dashboard Types
 *
 * Core types for dashboard persistence and layout management.
 */

import type { Json } from '@brika/shared';

/** A brick placed on a dashboard */
export interface DashboardBrickPlacement {
  instanceId: string;
  brickTypeId: string;
  label?: string;
  config: Record<string, Json>;
  position: { x: number; y: number };
  size: { w: number; h: number };
}

/** A dashboard layout */
export interface Dashboard {
  id: string;
  name: string;
  icon?: string;
  columns: number;
  bricks: DashboardBrickPlacement[];
}
