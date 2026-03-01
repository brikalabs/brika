/**
 * Board Types
 *
 * Core types for board persistence and layout management.
 */

import type { Json } from '@/types';

/** A brick placed on a board */
export interface BoardBrickPlacement {
  instanceId: string;
  brickTypeId: string;
  label?: string;
  config: Record<string, Json>;
  position: {
    x: number;
    y: number;
  };
  size: {
    w: number;
    h: number;
  };
}

/** A board layout */
export interface Board {
  id: string;
  name: string;
  icon?: string;
  columns: number;
  bricks: BoardBrickPlacement[];
}
