import { describe, expect, test } from 'bun:test';
import { BRIX_H, CROUCH_H, CROUCH_HOLD_MS, INITIAL_SCROLL, JUMP_VY, MAX_SCROLL } from './constants';
import { makeInitial } from './initial';
import { reduce } from './state';

const WORLD_W = 60;
const WORLD_H = 11;

function start(): ReturnType<typeof makeInitial> {
  return makeInitial(0, WORLD_W, WORLD_H);
}

describe('reduce — lifecycle', () => {
  test('any control action flips the run from ready to running', () => {
    for (const t of ['jump', 'crouch', 'moveLeft', 'moveRight'] as const) {
      const next = reduce(start(), { type: t });
      expect(next.status).toBe('running');
      expect(next.t).toBe(0);
    }
  });

  test('pause toggles running ↔ paused', () => {
    const running = reduce(start(), { type: 'jump' });
    const paused = reduce(running, { type: 'pause' });
    expect(paused.status).toBe('paused');
    const resumed = reduce(paused, { type: 'pause' });
    expect(resumed.status).toBe('running');
  });

  test('reset returns to ready while preserving best', () => {
    const s = { ...start(), best: 42, score: 17, status: 'over' as const };
    const next = reduce(s, { type: 'reset' });
    expect(next.status).toBe('ready');
    expect(next.best).toBe(42);
    expect(next.score).toBe(0);
  });
});

describe('reduce — jump', () => {
  test('grounded → applies JUMP_VY and clears grounded', () => {
    const running = reduce(start(), { type: 'jump' });
    expect(running.brix.vy).toBe(JUMP_VY);
    expect(running.brix.grounded).toBe(false);
  });

  test('mid-air → no-op (no double-jump)', () => {
    const a = reduce(start(), { type: 'jump' });
    const b = reduce(a, { type: 'jump' });
    expect(b).toBe(a);
  });

  test('from over → resets game (treat the jump as "play again")', () => {
    const over = { ...start(), status: 'over' as const, score: 5, best: 10 };
    const next = reduce(over, { type: 'jump' });
    expect(next.status).toBe('ready');
    expect(next.best).toBe(10);
    expect(next.score).toBe(0);
  });
});

describe('reduce — crouch', () => {
  test('sets crouchUntil into the future', () => {
    const running = reduce(start(), { type: 'jump' });
    const next = reduce(running, { type: 'crouch' });
    expect(next.crouchUntil).toBe(running.t + CROUCH_HOLD_MS);
  });

  test('paused or over → no-op', () => {
    const paused = { ...start(), status: 'paused' as const };
    expect(reduce(paused, { type: 'crouch' })).toBe(paused);
    const over = { ...start(), status: 'over' as const };
    expect(reduce(over, { type: 'crouch' })).toBe(over);
  });
});

describe('reduce — tick', () => {
  test('ignores tick while not running', () => {
    expect(reduce(start(), { type: 'tick', dtMs: 100 }).status).toBe('ready');
  });

  test('advances t and scrollOffset', () => {
    const running = reduce(start(), { type: 'jump' });
    const next = reduce(running, { type: 'tick', dtMs: 100 });
    expect(next.t).toBe(running.t + 100);
    expect(next.scrollOffset).toBeGreaterThan(running.scrollOffset);
  });

  test('scrollSpeed ramps but never exceeds MAX_SCROLL', () => {
    let s = reduce(start(), { type: 'jump' });
    for (let i = 0; i < 600; i += 1) {
      s = reduce(s, { type: 'tick', dtMs: 100 });
    }
    expect(s.scrollSpeed).toBeLessThanOrEqual(MAX_SCROLL);
    expect(s.scrollSpeed).toBeGreaterThan(INITIAL_SCROLL);
  });

  test('crouch shrinks the brick while grounded', () => {
    let s = reduce(start(), { type: 'crouch' });
    s = reduce(s, { type: 'tick', dtMs: 50 });
    expect(s.brix.h).toBe(CROUCH_H);
  });

  test('crouch expires after CROUCH_HOLD_MS', () => {
    let s = reduce(start(), { type: 'crouch' });
    for (let i = 0; i < 30; i += 1) {
      s = reduce(s, { type: 'tick', dtMs: 50 });
    }
    expect(s.brix.h).toBe(BRIX_H);
  });

  test('lateral move impulses cx in the chosen direction', () => {
    let s = reduce(start(), { type: 'moveRight' });
    const startCx = s.brix.cx;
    for (let i = 0; i < 5; i += 1) {
      s = reduce(s, { type: 'tick', dtMs: 50 });
    }
    expect(s.brix.cx).toBeGreaterThan(startCx);
  });

  test('cx is clamped inside the playable area', () => {
    let s = reduce(start(), { type: 'moveLeft' });
    for (let i = 0; i < 100; i += 1) {
      s = reduce(s, { type: 'tick', dtMs: 50 });
    }
    expect(s.brix.cx).toBeGreaterThanOrEqual(3);
  });
});

describe('reduce — resize', () => {
  test('same dimensions → identity', () => {
    const s = start();
    expect(reduce(s, { type: 'resize', width: WORLD_W, height: WORLD_H })).toBe(s);
  });

  test('shrinking the world clamps Brix back inside', () => {
    let s = reduce(start(), { type: 'moveRight' });
    for (let i = 0; i < 50; i += 1) {
      s = reduce(s, { type: 'tick', dtMs: 50 });
    }
    const cxBefore = s.brix.cx;
    const shrunk = reduce(s, { type: 'resize', width: 40, height: 9 });
    expect(shrunk.brix.cx).toBeLessThanOrEqual(36);
    expect(shrunk.brix.cx).toBeLessThanOrEqual(cxBefore);
  });
});
