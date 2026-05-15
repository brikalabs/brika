import { describe, expect, test } from 'bun:test';
import { brickHitbox, obstacleHitbox, overlap } from './collision';
import { BRIX_H, BRIX_W, CROUCH_H } from './constants';
import { geomOf } from './geometry';
import type { Obstacle } from './obstacles';

const geom = geomOf(60, 11);

function brix(over: Partial<{ cx: number; y: number; h: number }> = {}) {
  return {
    cx: over.cx ?? 7,
    vx: 0,
    y: over.y ?? 0,
    vy: 0,
    w: BRIX_W,
    h: over.h ?? BRIX_H,
    grounded: (over.y ?? 0) === 0,
  };
}

function ob(kind: Obstacle['kind'], x: number): Obstacle {
  return { id: 1, kind, x };
}

describe('overlap', () => {
  test('touching corners count as overlap (inclusive AABB)', () => {
    expect(
      overlap({ left: 0, right: 2, top: 0, bottom: 2 }, { left: 2, right: 4, top: 2, bottom: 4 })
    ).toBe(true);
  });

  test('separated boxes do not overlap', () => {
    expect(
      overlap({ left: 0, right: 1, top: 0, bottom: 1 }, { left: 3, right: 4, top: 0, bottom: 1 })
    ).toBe(false);
  });
});

describe('brickHitbox', () => {
  test('grounded Brix sits with feet on the floor row', () => {
    const b = brickHitbox(brix(), geom);
    expect(b.bottom).toBe(geom.floorY);
    expect(b.top).toBe(geom.floorY - BRIX_H + 1);
  });

  test('mid-air Brix lifts off the floor by his y value', () => {
    const b = brickHitbox(brix({ y: 3 }), geom);
    expect(b.bottom).toBe(geom.floorY - 3);
  });

  test('crouching shrinks the hitbox upward, not downward', () => {
    const b = brickHitbox(brix({ h: CROUCH_H }), geom);
    expect(b.bottom).toBe(geom.floorY);
    expect(b.top).toBe(geom.floorY - CROUCH_H + 1);
  });
});

describe('obstacle vs brick collision', () => {
  test('saguaro right under Brix → collision', () => {
    const b = brickHitbox(brix(), geom);
    const o = obstacleHitbox(ob('saguaro', 6), geom);
    expect(overlap(b, o)).toBe(true);
  });

  test('saguaro under Brix mid-jump → no collision', () => {
    const b = brickHitbox(brix({ y: 4 }), geom);
    const o = obstacleHitbox(ob('saguaro', 6), geom);
    expect(overlap(b, o)).toBe(false);
  });

  test('bird passes overhead when Brix crouches', () => {
    const standing = brickHitbox(brix(), geom);
    const crouched = brickHitbox(brix({ h: CROUCH_H }), geom);
    const o = obstacleHitbox(ob('bird', 6), geom);
    expect(overlap(standing, o)).toBe(true);
    expect(overlap(crouched, o)).toBe(false);
  });
});
