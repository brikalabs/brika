/**
 * Unit tests for the obstacle catalog + lifecycle. The `rand()`-driven
 * branches in `pickCactus` / `spawnObstacle` are exercised through
 * `maybeSpawn`'s observable behaviour (a new obstacle is appended and
 * `nextSpawnAt` advances) without locking in a specific kind, since the
 * RNG is non-deterministic by design.
 */

import { describe, expect, test } from 'bun:test';
import { SPAWN_GAP_MIN_CELLS } from './constants';
import {
  maybeSpawn,
  OBSTACLES,
  type Obstacle,
  type ObstacleKind,
  spriteFor,
  tickObstacles,
} from './obstacles';

const ALL_KINDS: ObstacleKind[] = ['sprout', 'pup', 'saguaro', 'bent', 'twin', 'bird'];

describe('OBSTACLES catalog', () => {
  test('every kind has a sprite definition with non-zero dimensions', () => {
    for (const kind of ALL_KINDS) {
      const def = OBSTACLES[kind];
      expect(def.spriteW).toBeGreaterThan(0);
      expect(def.spriteH).toBeGreaterThan(0);
      expect(def.hitW).toBeGreaterThan(0);
      expect(def.hitH).toBeGreaterThan(0);
    }
  });

  test('birds fly above the floor (alt > 0); cacti sit on it (alt 0)', () => {
    expect(OBSTACLES.bird.alt).toBeGreaterThan(0);
    expect(OBSTACLES.sprout.alt).toBe(0);
    expect(OBSTACLES.saguaro.alt).toBe(0);
  });
});

describe('spriteFor', () => {
  test('static cacti return the same sprite regardless of time', () => {
    for (const kind of ['sprout', 'pup', 'saguaro', 'bent', 'twin'] as const) {
      const a = spriteFor(kind, 0);
      const b = spriteFor(kind, 9999);
      expect(a).toBe(b);
    }
  });

  test('bird cycles through wing-flap frames with t', () => {
    const frames = new Set();
    for (let t = 0; t < 1000; t += 50) {
      frames.add(spriteFor('bird', t));
    }
    // The bird cycle has 4 frames (UP, LEVEL, DOWN, LEVEL) → 3 unique sprites.
    expect(frames.size).toBeGreaterThanOrEqual(3);
  });

  test('bird at t=0 produces a valid sprite', () => {
    const s = spriteFor('bird', 0);
    expect(s.width).toBeGreaterThan(0);
    expect(s.height).toBeGreaterThan(0);
  });
});

describe('tickObstacles', () => {
  test('scrolls every obstacle left by scrollSpeed * dt', () => {
    const obs: Obstacle[] = [{ id: 1, kind: 'sprout', x: 20 }];
    const result = tickObstacles(obs, 10, 0.1);
    expect(result.obstacles).toHaveLength(1);
    expect(result.obstacles[0]?.x).toBeCloseTo(19, 5);
    expect(result.passed).toBe(0);
  });

  test('obstacles that scroll past the left edge are dropped and counted as passed', () => {
    const obs: Obstacle[] = [{ id: 1, kind: 'sprout', x: -10 }];
    const result = tickObstacles(obs, 10, 0.1);
    expect(result.obstacles).toHaveLength(0);
    expect(result.passed).toBe(1);
  });

  test('passed count accumulates across multiple retirees', () => {
    const obs: Obstacle[] = [
      { id: 1, kind: 'sprout', x: -10 },
      { id: 2, kind: 'pup', x: -20 },
      { id: 3, kind: 'saguaro', x: 30 },
    ];
    const result = tickObstacles(obs, 10, 0.1);
    expect(result.passed).toBe(2);
    expect(result.obstacles).toHaveLength(1);
  });

  test('empty input → empty output, zero passed', () => {
    const result = tickObstacles([], 10, 0.1);
    expect(result.obstacles).toEqual([]);
    expect(result.passed).toBe(0);
  });
});

describe('maybeSpawn', () => {
  test('no-op when t < nextSpawnAt', () => {
    const out = maybeSpawn([], 100, 1000, 5, 8, 60);
    expect(out.obstacles).toEqual([]);
    expect(out.nextSpawnAt).toBe(1000);
    expect(out.nextId).toBe(5);
  });

  test('appends one obstacle, advances nextSpawnAt, increments nextId', () => {
    const out = maybeSpawn([], 1500, 1000, 7, 8, 60);
    expect(out.obstacles).toHaveLength(1);
    expect(out.nextId).toBe(8);
    expect(out.nextSpawnAt).toBeGreaterThan(1500);
    // The minimum gap is `SPAWN_GAP_MIN_CELLS / scrollSpeed` seconds.
    const minGapMs = (SPAWN_GAP_MIN_CELLS / 8) * 1000;
    expect(out.nextSpawnAt - 1500).toBeGreaterThanOrEqual(minGapMs - 1);
  });

  test('preserves existing obstacles when spawning', () => {
    const existing: Obstacle[] = [{ id: 1, kind: 'sprout', x: 30 }];
    const out = maybeSpawn(existing, 1500, 1000, 7, 8, 60);
    expect(out.obstacles).toHaveLength(2);
    expect(out.obstacles[0]).toEqual(existing[0]);
  });

  test('spawned obstacle starts off the right edge', () => {
    const out = maybeSpawn([], 1500, 1000, 7, 8, 60);
    const spawned = out.obstacles[0];
    expect(spawned).toBeDefined();
    expect(spawned?.x).toBeGreaterThanOrEqual(60);
  });

  test('only cacti spawn before the flying-unlock window', () => {
    // Spawn many obstacles at t=0 (before FLYING_UNLOCK_MS / BENT_UNLOCK_MS).
    const kinds = new Set<ObstacleKind>();
    for (let i = 0; i < 50; i += 1) {
      const out = maybeSpawn([], 1, 0, i, 8, 60);
      if (out.obstacles.length > 0) {
        const last = out.obstacles[out.obstacles.length - 1];
        if (last) {
          kinds.add(last.kind);
        }
      }
    }
    expect(kinds.has('bird')).toBe(false);
    expect(kinds.has('bent')).toBe(false);
    expect(kinds.has('twin')).toBe(false);
  });
});
