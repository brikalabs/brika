/**
 * Tests for the built-in particle emitter factories. Each public
 * emitter (sparkles, hearts, notes, zZz, tears, confetti) shares the
 * same `rateEmitter` shape — the assertions focus on the contract
 * consumers depend on: a `spawn(dt, rng)` function that produces well-
 * formed Particle objects rooted inside the supplied Origin rectangle.
 */

import { describe, expect, test } from 'bun:test';
import {
  CONFETTI_CHARS,
  confetti,
  HEART_CHARS,
  hearts,
  NOTE_CHARS,
  notes,
  type Origin,
  rateEmitter,
  SPARKLE_CHARS,
  sparkles,
  TEAR_CHARS,
  tears,
  Z_CHARS,
  zZz,
} from './particleEmitters';
import type { Emitter, Particle } from './particles';

const ORIGIN: Origin = { x: 0, y: 0, w: 10, h: 4 };

/** Predictable rng for deterministic spawn checks. */
function fixedRng(value = 0.5): () => number {
  return () => value;
}

function drain(emitter: Emitter, dtMs: number, rng = fixedRng()): ReadonlyArray<Particle> {
  return emitter.spawn(dtMs, rng);
}

describe('rateEmitter', () => {
  test('respects integer-floor spawn rate over time', () => {
    const e = rateEmitter({
      origin: ORIGIN,
      rate: 10,
      make: () => ({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        ax: 0,
        ay: 0,
        age: 0,
        life: 1000,
        chars: ['x'],
      }),
    });
    // Across 1000ms we expect exactly 10 particles, regardless of step size.
    let total = 0;
    for (let i = 0; i < 10; i += 1) {
      total += drain(e, 100).length;
    }
    expect(total).toBe(10);
  });

  test('caps spawns at `limit` when set', () => {
    const e = rateEmitter({
      origin: ORIGIN,
      rate: 100,
      limit: 3,
      make: () => ({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        ax: 0,
        ay: 0,
        age: 0,
        life: 1000,
        chars: ['x'],
      }),
    });
    const out = drain(e, 1000);
    expect(out.length).toBe(3);
  });

  test('stops spawning after `duration` elapses', () => {
    const e = rateEmitter({
      origin: ORIGIN,
      rate: 10,
      duration: 500,
      make: () => ({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        ax: 0,
        ay: 0,
        age: 0,
        life: 1000,
        chars: ['x'],
      }),
    });
    const a = drain(e, 500).length;
    const b = drain(e, 500).length;
    expect(a).toBe(5);
    expect(b).toBe(0);
  });
});

interface EmitterCase {
  readonly label: string;
  readonly factory: (o: Origin) => Emitter;
  readonly chars: ReadonlyArray<string>;
}

const CASES: ReadonlyArray<EmitterCase> = [
  { label: 'sparkles', factory: (o) => sparkles(o), chars: SPARKLE_CHARS },
  { label: 'hearts', factory: (o) => hearts(o), chars: HEART_CHARS },
  { label: 'notes', factory: (o) => notes(o), chars: NOTE_CHARS },
  { label: 'zZz', factory: (o) => zZz(o), chars: Z_CHARS },
  { label: 'tears', factory: (o) => tears(o), chars: TEAR_CHARS },
  { label: 'confetti', factory: (o) => confetti(o), chars: CONFETTI_CHARS },
];

describe('built-in emitters', () => {
  for (const { label, factory, chars } of CASES) {
    test(`${label} spawns particles inside the origin with the expected glyph palette`, () => {
      const emitter = factory(ORIGIN);
      // 2000ms is enough for every emitter to produce at least one particle
      // even at the slowest configured rate (zZz is 1.2/s).
      const particles = drain(emitter, 2000);
      expect(particles.length).toBeGreaterThan(0);
      for (const p of particles) {
        expect(p.x).toBeGreaterThanOrEqual(ORIGIN.x);
        expect(p.x).toBeLessThanOrEqual(ORIGIN.x + ORIGIN.w);
        expect(p.y).toBeGreaterThanOrEqual(ORIGIN.y);
        expect(p.y).toBeLessThanOrEqual(ORIGIN.y + ORIGIN.h);
        expect(p.life).toBeGreaterThan(0);
        expect(p.chars).toEqual(chars);
      }
    });
  }

  test('emitter tuning overrides color and rate', () => {
    const emitter = sparkles(ORIGIN, { color: 'red', rate: 20 });
    const particles = drain(emitter, 1000);
    expect(particles.length).toBe(20);
    for (const p of particles) {
      expect(p.color).toBe('red');
    }
  });
});
