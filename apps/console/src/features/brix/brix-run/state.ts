/**
 * Pure state machine — types + initial-state factory + reducer.
 *
 *   ready ─jump|crouch|move─> running ─tick…─> running
 *     │                         │
 *     │                         ├─pause─> paused ─pause─> running
 *     │                         └─collision─> over ─jump|reset─> ready
 *     └─reset─> ready
 */

import type { BrickState } from '@brika/brix';
import type { Cloud } from './clouds';
import { makeInitial } from './initial';
import type { Obstacle } from './obstacles';
import { applyTick } from './tick';
import { applyCrouch, applyJump, applyMove, applyPause, applyResize } from './transitions';

export type GameStatus = 'ready' | 'running' | 'paused' | 'over';

export interface GameState {
  readonly status: GameStatus;
  readonly brix: BrickState;
  readonly obstacles: ReadonlyArray<Obstacle>;
  readonly clouds: ReadonlyArray<Cloud>;
  readonly scrollSpeed: number;
  readonly score: number;
  readonly best: number;
  readonly nextSpawnAt: number;
  readonly nextId: number;
  readonly t: number;
  readonly crouchUntil: number;
  readonly moveLeftUntil: number;
  readonly moveRightUntil: number;
  readonly scrollOffset: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
}

export type Action =
  | { type: 'tick'; dtMs: number }
  | { type: 'jump' }
  | { type: 'crouch' }
  | { type: 'moveLeft' }
  | { type: 'moveRight' }
  | { type: 'pause' }
  | { type: 'reset' }
  | { type: 'resize'; width: number; height: number };

export function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'reset':
      return makeInitial(state.best, state.worldWidth, state.worldHeight);
    case 'resize':
      return applyResize(state, action.width, action.height);
    case 'pause':
      return applyPause(state);
    case 'jump':
      return applyJump(state);
    case 'crouch':
      return applyCrouch(state);
    case 'moveLeft':
      return applyMove(state, 'left');
    case 'moveRight':
      return applyMove(state, 'right');
    case 'tick':
      return applyTick(state, action.dtMs);
  }
}
