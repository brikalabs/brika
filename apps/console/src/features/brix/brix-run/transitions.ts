/** Single-step state transitions (everything except `tick`). */

import { cloudCount, makeInitialClouds } from './clouds';
import { BRIX_H, CROUCH_HOLD_MS, JUMP_VY, MOVE_HOLD_MS } from './constants';
import { clamp, geomOf } from './geometry';
import { makeInitial } from './initial';
import type { GameState } from './state';

const FROZEN = (s: GameState): boolean => s.status === 'over' || s.status === 'paused';

/** Promote `ready` → `running` and zero the run clock. */
function startRun<S extends GameState>(s: S): S {
  return s.status === 'ready' ? { ...s, status: 'running', t: 0, scrollOffset: 0 } : s;
}

export function applyResize(s: GameState, width: number, height: number): GameState {
  if (s.worldWidth === width && s.worldHeight === height) {
    return s;
  }
  const geom = geomOf(width, height);
  return {
    ...s,
    worldWidth: width,
    worldHeight: height,
    brix: { ...s.brix, cx: clamp(s.brix.cx, geom.brixMinX, geom.brixMaxX) },
    clouds: s.clouds.length === cloudCount(width) ? s.clouds : makeInitialClouds(width),
  };
}

export function applyJump(s: GameState): GameState {
  if (s.status === 'over') {
    return makeInitial(s.best, s.worldWidth, s.worldHeight);
  }
  if (s.status === 'paused' || !s.brix.grounded) {
    return s;
  }
  return {
    ...startRun(s),
    brix: { ...s.brix, vy: JUMP_VY, grounded: false, h: BRIX_H },
    crouchUntil: 0,
  };
}

export function applyCrouch(s: GameState): GameState {
  if (FROZEN(s)) {
    return s;
  }
  return { ...startRun(s), crouchUntil: s.t + CROUCH_HOLD_MS };
}

export function applyMove(s: GameState, dir: 'left' | 'right'): GameState {
  if (FROZEN(s)) {
    return s;
  }
  const next = startRun(s);
  return dir === 'left'
    ? { ...next, moveLeftUntil: s.t + MOVE_HOLD_MS, moveRightUntil: 0 }
    : { ...next, moveRightUntil: s.t + MOVE_HOLD_MS, moveLeftUntil: 0 };
}

export function applyPause(s: GameState): GameState {
  if (s.status === 'running') {
    return { ...s, status: 'paused' };
  }
  if (s.status === 'paused') {
    return { ...s, status: 'running' };
  }
  return s;
}
