import { makeInitialClouds } from './clouds';
import { BRIX_H, BRIX_W, INITIAL_SCROLL, INITIAL_SPAWN_DELAY_MS } from './constants';
import { geomOf } from './geometry';
import type { GameState } from './state';

export function makeInitial(best: number, width: number, height: number): GameState {
  const geom = geomOf(width, height);
  return {
    status: 'ready',
    brix: {
      cx: Math.min(7, geom.brixMaxX),
      vx: 0,
      y: 0,
      vy: 0,
      w: BRIX_W,
      h: BRIX_H,
      grounded: true,
    },
    obstacles: [],
    clouds: makeInitialClouds(width),
    scrollSpeed: INITIAL_SCROLL,
    score: 0,
    best,
    nextSpawnAt: INITIAL_SPAWN_DELAY_MS,
    nextId: 1,
    t: 0,
    crouchUntil: 0,
    moveLeftUntil: 0,
    moveRightUntil: 0,
    scrollOffset: 0,
    worldWidth: width,
    worldHeight: height,
  };
}
