/**
 * Pure-function tests for the brix physics integrator.
 */

import { describe, expect, test } from 'bun:test';
import { makeBrick, step } from './physics';

describe('step', () => {
  test('rest body under gravity stays grounded (no bounce)', () => {
    const s = makeBrick();
    const next = step(s, 33);
    expect(next.grounded).toBe(true);
    expect(next.y).toBe(0);
    expect(next.vy).toBe(0);
  });

  test('positive vy lifts the body off the floor; gravity reduces vy', () => {
    const s = makeBrick({ vy: 10, grounded: false });
    const next = step(s, 100); // dt = 0.1s
    expect(next.y).toBeGreaterThan(0);
    expect(next.vy).toBeLessThan(10);
    expect(next.grounded).toBe(false);
  });

  test('horizontal velocity advances cx', () => {
    const s = makeBrick({ vx: 5 });
    const next = step(s, 100);
    expect(next.cx).toBeCloseTo(s.cx + 0.5, 5);
  });

  test('landing without restitution snaps to floor and zeros vy', () => {
    const s = makeBrick({ y: 0.1, vy: -8, grounded: false });
    const next = step(s, 100);
    expect(next.grounded).toBe(true);
    expect(next.y).toBe(0);
    expect(next.vy).toBe(0);
  });

  test('landing with restitution rebounds the body', () => {
    const s = makeBrick({ y: 0.1, vy: -10, grounded: false });
    const next = step(s, 100, 40, 0.5);
    // vy should be flipped and halved (minus the gravity tick).
    expect(next.grounded).toBe(false);
    expect(next.vy).toBeGreaterThan(0);
    // After one tick of integration: vy = old_vy - g*dt = -10 - 40*0.1 = -14
    // Then rebound: 14 * 0.5 = 7
    expect(next.vy).toBeCloseTo(7, 1);
  });

  test('soft landings settle even with restitution > 0 (BOUNCE_REST_VY)', () => {
    // Impact speed below the rest threshold (~3) — should snap to rest
    // even though restitution is non-zero. Prevents infinite micro-hops.
    const s = makeBrick({ y: 0.01, vy: -1, grounded: false });
    const next = step(s, 50, 40, 0.5);
    expect(next.grounded).toBe(true);
    expect(next.vy).toBe(0);
  });
});
