/** The per-frame pipeline: time → scroll → physics → world → collision. */

import { type BrickState, stepPhysics } from '@brika/brix';
import { tickClouds } from './clouds';
import { brickHitbox, obstacleHitbox, overlap } from './collision';
import {
  BRIX_H,
  CROUCH_H,
  GAME_GRAVITY,
  INITIAL_SCROLL,
  MAX_SCROLL,
  MOVE_VX,
  SCROLL_ACCEL,
} from './constants';
import { clamp, geomOf } from './geometry';
import { maybeSpawn, tickObstacles } from './obstacles';
import type { GameState } from './state';

const scrollSpeedAt = (t: number): number =>
  Math.min(MAX_SCROLL, INITIAL_SCROLL + (t / 1000) * SCROLL_ACCEL);

function lateralVelocity(s: GameState, t: number): number {
  return (t < s.moveLeftUntil ? -MOVE_VX : 0) + (t < s.moveRightUntil ? MOVE_VX : 0);
}

function advanceBrix(s: GameState, t: number, dtMs: number): BrickState {
  const geom = geomOf(s.worldWidth, s.worldHeight);
  const vx = lateralVelocity(s, t);
  const stepped = stepPhysics({ ...s.brix, vx }, dtMs, GAME_GRAVITY);
  const crouching = stepped.grounded && s.crouchUntil > t;
  return {
    ...stepped,
    cx: clamp(stepped.cx, geom.brixMinX, geom.brixMaxX),
    h: crouching ? CROUCH_H : BRIX_H,
  };
}

function detectCollision(brix: BrickState, s: GameState): boolean {
  const geom = geomOf(s.worldWidth, s.worldHeight);
  const bx = brickHitbox(brix, geom);
  return s.obstacles.some((ob) => overlap(bx, obstacleHitbox(ob, geom)));
}

export function applyTick(s: GameState, dtMs: number): GameState {
  if (s.status !== 'running') {
    return s;
  }

  const dtSec = dtMs / 1000;
  const t = s.t + dtMs;
  const scrollSpeed = scrollSpeedAt(t);
  const scrollOffset = s.scrollOffset + scrollSpeed * dtSec;

  const brix = advanceBrix(s, t, dtMs);
  const clouds = tickClouds(s.clouds, dtSec, scrollSpeed, s.worldWidth);
  const scrolled = tickObstacles(s.obstacles, scrollSpeed, dtSec);
  const spawned = maybeSpawn(
    scrolled.obstacles,
    t,
    s.nextSpawnAt,
    s.nextId,
    scrollSpeed,
    s.worldWidth
  );

  const next: GameState = {
    ...s,
    brix,
    clouds,
    obstacles: spawned.obstacles,
    scrollSpeed,
    scrollOffset,
    score: s.score + scrolled.passed,
    nextSpawnAt: spawned.nextSpawnAt,
    nextId: spawned.nextId,
    t,
  };

  if (!detectCollision(brix, next)) {
    return next;
  }
  return {
    ...next,
    status: 'over',
    brix: { ...brix, vx: 0, vy: 8, grounded: false, h: BRIX_H },
    best: Math.max(s.best, next.score),
  };
}
