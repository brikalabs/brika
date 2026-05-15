/** World geometry derived from the runtime canvas size. */

import {
  FALLBACK_WORLD_HEIGHT,
  FALLBACK_WORLD_WIDTH,
  MAX_WORLD_HEIGHT,
  MAX_WORLD_WIDTH,
  MIN_WORLD_HEIGHT,
  MIN_WORLD_WIDTH,
} from './constants';

export interface Geometry {
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly floorY: number;
  readonly floorLineY: number;
  readonly sunX: number;
  readonly brixMinX: number;
  readonly brixMaxX: number;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function geomOf(width: number, height: number): Geometry {
  return {
    worldWidth: width,
    worldHeight: height,
    floorY: height - 2,
    floorLineY: height - 1,
    sunX: Math.max(0, width - 4),
    brixMinX: 3,
    brixMaxX: Math.max(8, width - 4),
  };
}

/** Translate measured canvas size into clamped world dimensions.
 *  The bordered box eats 4 horizontal (2 border + 2 padding) and 2
 *  vertical (border only) cells. */
export function worldDimsFromCanvas(
  measuredW: number,
  measuredH: number
): { width: number; height: number } {
  const w = measuredW > 0 ? measuredW - 4 : FALLBACK_WORLD_WIDTH;
  const h = measuredH > 0 ? measuredH - 2 : FALLBACK_WORLD_HEIGHT;
  return {
    width: clamp(w, MIN_WORLD_WIDTH, MAX_WORLD_WIDTH),
    height: clamp(h, MIN_WORLD_HEIGHT, MAX_WORLD_HEIGHT),
  };
}
