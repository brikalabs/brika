/**
 * Unit tests for the single-step transition reducers. `state.test.ts`
 * exercises these through the higher-level `reduce`; here we cover the
 * branches that `reduce` doesn't reach directly — resize cloud rebuild,
 * pause idempotency on `ready`/`over`, jump idempotency mid-air.
 */

import { describe, expect, test } from 'bun:test';
import { cloudCount } from './clouds';
import { CROUCH_HOLD_MS, JUMP_VY, MOVE_HOLD_MS } from './constants';
import { makeInitial } from './initial';
import type { GameState } from './state';
import { applyCrouch, applyJump, applyMove, applyPause, applyResize } from './transitions';

const WORLD_W = 60;
const WORLD_H = 11;

const ready = (): GameState => makeInitial(0, WORLD_W, WORLD_H);
const runningState = (): GameState => ({ ...ready(), status: 'running', t: 0 });

describe('applyResize', () => {
  test('identity when neither dimension changes', () => {
    const s = ready();
    expect(applyResize(s, WORLD_W, WORLD_H)).toBe(s);
  });

  test('shrinking the world clamps Brix and persists the new dims', () => {
    const s: GameState = { ...runningState(), brix: { ...ready().brix, cx: 50 } };
    const resized = applyResize(s, 30, 9);
    expect(resized.worldWidth).toBe(30);
    expect(resized.worldHeight).toBe(9);
    expect(resized.brix.cx).toBeLessThanOrEqual(30 - 4);
  });

  test('rebuilds the cloud list when the target width needs a different count', () => {
    const s = ready();
    const targetW = 200;
    const resized = applyResize(s, targetW, WORLD_H);
    expect(resized.clouds).toHaveLength(cloudCount(targetW));
  });

  test('keeps clouds when the count is unchanged (only height differs)', () => {
    const s = ready();
    const resized = applyResize(s, WORLD_W, WORLD_H + 1);
    expect(resized.clouds).toBe(s.clouds);
  });
});

describe('applyJump', () => {
  test('grounded ready → starts the run and applies JUMP_VY', () => {
    const next = applyJump(ready());
    expect(next.status).toBe('running');
    expect(next.brix.vy).toBe(JUMP_VY);
    expect(next.brix.grounded).toBe(false);
  });

  test('mid-air jump is a no-op (no double-jump)', () => {
    const airborne: GameState = {
      ...runningState(),
      brix: { ...runningState().brix, grounded: false, vy: 4 },
    };
    expect(applyJump(airborne)).toBe(airborne);
  });

  test('paused jump is a no-op', () => {
    const paused: GameState = { ...runningState(), status: 'paused' };
    expect(applyJump(paused)).toBe(paused);
  });

  test('jumping after game over resets the game while preserving best', () => {
    const over: GameState = { ...runningState(), status: 'over', score: 9, best: 42 };
    const next = applyJump(over);
    expect(next.status).toBe('ready');
    expect(next.best).toBe(42);
    expect(next.score).toBe(0);
  });

  test('jump from ready clears any stale crouch', () => {
    const s: GameState = { ...ready(), crouchUntil: 999 };
    const next = applyJump(s);
    expect(next.crouchUntil).toBe(0);
  });
});

describe('applyCrouch', () => {
  test('ready → running with crouchUntil set into the future', () => {
    const next = applyCrouch(ready());
    expect(next.status).toBe('running');
    expect(next.crouchUntil).toBe(CROUCH_HOLD_MS);
  });

  test('paused → no-op', () => {
    const paused: GameState = { ...runningState(), status: 'paused' };
    expect(applyCrouch(paused)).toBe(paused);
  });

  test('over → no-op', () => {
    const over: GameState = { ...runningState(), status: 'over' };
    expect(applyCrouch(over)).toBe(over);
  });
});

describe('applyMove', () => {
  test('left → sets moveLeftUntil and clears any active moveRight', () => {
    const s: GameState = { ...runningState(), moveRightUntil: 500 };
    const next = applyMove(s, 'left');
    expect(next.moveLeftUntil).toBe(s.t + MOVE_HOLD_MS);
    expect(next.moveRightUntil).toBe(0);
  });

  test('right → sets moveRightUntil and clears any active moveLeft', () => {
    const s: GameState = { ...runningState(), moveLeftUntil: 500 };
    const next = applyMove(s, 'right');
    expect(next.moveRightUntil).toBe(s.t + MOVE_HOLD_MS);
    expect(next.moveLeftUntil).toBe(0);
  });

  test('from ready → promotes status to running', () => {
    const next = applyMove(ready(), 'right');
    expect(next.status).toBe('running');
  });

  test('over → no-op', () => {
    const over: GameState = { ...runningState(), status: 'over' };
    expect(applyMove(over, 'left')).toBe(over);
  });

  test('paused → no-op', () => {
    const paused: GameState = { ...runningState(), status: 'paused' };
    expect(applyMove(paused, 'right')).toBe(paused);
  });
});

describe('applyPause', () => {
  test('running → paused', () => {
    expect(applyPause(runningState()).status).toBe('paused');
  });

  test('paused → running', () => {
    const paused: GameState = { ...runningState(), status: 'paused' };
    expect(applyPause(paused).status).toBe('running');
  });

  test('ready → no-op (cannot pause before play)', () => {
    const s = ready();
    expect(applyPause(s)).toBe(s);
  });

  test('over → no-op', () => {
    const over: GameState = { ...runningState(), status: 'over' };
    expect(applyPause(over)).toBe(over);
  });
});
