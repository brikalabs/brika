/** Axis-aligned bounding-box collision. */

import type { BrickState } from '@brika/brix';
import { HITBOX_W } from './constants';
import type { Geometry } from './geometry';
import { OBSTACLES, type Obstacle } from './obstacles';

export interface Box2D {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export function brickHitbox(brix: BrickState, geom: Geometry): Box2D {
  const left = Math.round(brix.cx) - Math.floor(HITBOX_W / 2);
  const bottom = geom.floorY - Math.round(brix.y);
  return { left, right: left + HITBOX_W - 1, top: bottom - brix.h + 1, bottom };
}

export function obstacleHitbox(ob: Obstacle, geom: Geometry): Box2D {
  const def = OBSTACLES[ob.kind];
  // Centered inside the visible sprite — wing-tips and cactus arms
  // are forgiving visual flourish.
  const left = Math.round(ob.x) + Math.floor((def.spriteW - def.hitW) / 2);
  const bottom = geom.floorY - def.alt;
  return { left, right: left + def.hitW - 1, top: bottom - def.hitH + 1, bottom };
}

export function overlap(a: Box2D, b: Box2D): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}
