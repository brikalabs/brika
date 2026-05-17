/** Parallax-scrolling clouds. */

import { CLOUD_GLYPHS, CLOUD_SPEED_RATIO } from './constants';
import { pick, rand } from './random';

export interface Cloud {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly glyph: string;
}

export function cloudCount(width: number): number {
  return Math.max(3, Math.min(12, Math.floor(width / 10)));
}

function newCloud(id: number, x: number): Cloud {
  return { id, x, y: Math.floor(rand(0, 3)), glyph: pick(CLOUD_GLYPHS) };
}

export function makeInitialClouds(width: number): Cloud[] {
  return Array.from({ length: cloudCount(width) }, (_, i) => newCloud(i + 1, rand(0, width)));
}

export function tickClouds(
  clouds: ReadonlyArray<Cloud>,
  dtSec: number,
  scrollSpeed: number,
  worldWidth: number
): Cloud[] {
  const dx = scrollSpeed * CLOUD_SPEED_RATIO * dtSec;
  return clouds.map((c) => {
    const nx = c.x - dx;
    return nx + c.glyph.length < 0 ? newCloud(c.id, worldWidth + rand(0, 6)) : { ...c, x: nx };
  });
}
