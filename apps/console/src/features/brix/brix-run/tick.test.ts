/**
 * Unit tests for `applyTick` — the per-frame physics + scroll pipeline.
 * `state.test.ts` exercises this through `reduce`; here we hit it
 * directly to lock down the branches the high-level tests don't reach:
 * the no-op for non-running statuses, collision-induced game over, and
 * the score increment when an obstacle scrolls off the left edge.
 */

import { describe, expect, test } from 'bun:test';
import { BRIX_H, INITIAL_SCROLL, MAX_SCROLL, MOVE_VX } from './constants';
import { makeInitial } from './initial';
import type { GameState } from './state';
import { applyTick } from './tick';

const WORLD_W = 60;
const WORLD_H = 11;

function running(): GameState {
  const base = makeInitial(0, WORLD_W, WORLD_H);
  return { ...base, status: 'running', t: 0 };
}

describe('applyTick — gating', () => {
  test('returns the same reference when not running (ready)', () => {
    const s = makeInitial(0, WORLD_W, WORLD_H);
    expect(applyTick(s, 100)).toBe(s);
  });

  test('returns the same reference when paused', () => {
    const s: GameState = { ...running(), status: 'paused' };
    expect(applyTick(s, 100)).toBe(s);
  });

  test('returns the same reference when over', () => {
    const s: GameState = { ...running(), status: 'over' };
    expect(applyTick(s, 100)).toBe(s);
  });
});

describe('applyTick — physics + scroll', () => {
  test('advances the run clock by dtMs', () => {
    const s = running();
    const next = applyTick(s, 100);
    expect(next.t).toBe(100);
  });

  test('scrollSpeed starts at INITIAL_SCROLL on the first tick', () => {
    const next = applyTick(running(), 16);
    expect(next.scrollSpeed).toBeGreaterThanOrEqual(INITIAL_SCROLL);
    expect(next.scrollSpeed).toBeLessThan(INITIAL_SCROLL + 0.1);
  });

  test('scrollSpeed never exceeds MAX_SCROLL even on long sessions', () => {
    let s = running();
    // 200 seconds worth of ticks at 50ms each
    for (let i = 0; i < 4000; i += 1) {
      s = applyTick(s, 50);
    }
    expect(s.scrollSpeed).toBeLessThanOrEqual(MAX_SCROLL);
  });

  test('scrollOffset grows monotonically', () => {
    let s = running();
    let prev = s.scrollOffset;
    for (let i = 0; i < 10; i += 1) {
      s = applyTick(s, 50);
      expect(s.scrollOffset).toBeGreaterThan(prev);
      prev = s.scrollOffset;
    }
  });

  test('moveRight applies a positive lateral velocity to Brix', () => {
    const s: GameState = { ...running(), moveRightUntil: 1000 };
    const next = applyTick(s, 50);
    expect(next.brix.vx).toBe(MOVE_VX);
  });

  test('moveLeft applies a negative lateral velocity to Brix', () => {
    const s: GameState = { ...running(), moveLeftUntil: 1000 };
    const next = applyTick(s, 50);
    expect(next.brix.vx).toBe(-MOVE_VX);
  });

  test('clamps Brix cx inside the playable area', () => {
    // Park Brix at the right edge and keep pushing right.
    let s: GameState = {
      ...running(),
      brix: { ...running().brix, cx: WORLD_W - 4 },
      moveRightUntil: 9999,
    };
    for (let i = 0; i < 50; i += 1) {
      s = applyTick(s, 50);
    }
    expect(s.brix.cx).toBeLessThanOrEqual(WORLD_W - 4);
  });
});

describe('applyTick — collisions', () => {
  test('overlapping obstacle flips status to over and bumps best', () => {
    const s: GameState = {
      ...running(),
      score: 5,
      best: 3,
      obstacles: [{ id: 1, kind: 'saguaro', x: 7 }],
    };
    const next = applyTick(s, 50);
    expect(next.status).toBe('over');
    expect(next.best).toBeGreaterThanOrEqual(5);
    // Death animation: Brix lifted off the ground, hit-pop vy.
    expect(next.brix.grounded).toBe(false);
    expect(next.brix.h).toBe(BRIX_H);
  });

  test('obstacle scrolling off the left edge increments the score', () => {
    const s: GameState = {
      ...running(),
      obstacles: [{ id: 1, kind: 'sprout', x: -10 }],
    };
    const next = applyTick(s, 50);
    expect(next.score).toBe(1);
    expect(next.obstacles).toHaveLength(0);
  });

  test('an obstacle still on-screen survives the tick', () => {
    const s: GameState = {
      ...running(),
      obstacles: [{ id: 1, kind: 'sprout', x: WORLD_W - 5 }],
    };
    const next = applyTick(s, 50);
    expect(next.obstacles).toHaveLength(1);
    expect(next.score).toBe(0);
  });
});
