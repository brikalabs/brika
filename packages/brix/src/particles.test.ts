import { describe, expect, test } from 'bun:test';
import { confetti, hearts, notes, rateEmitter, sparkles, zZz } from './particleEmitters';
import { type Emitter, emptyField, type Particle, renderField, stepField } from './particles';
import { makeRng } from './rng';

const RNG = makeRng(1);

function fixedParticle(p: Partial<Particle> = {}): Particle {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    ax: 0,
    ay: 0,
    age: 0,
    life: 1000,
    chars: ['A', 'B'],
    ...p,
  };
}

describe('stepField', () => {
  test('advects by velocity over dt', () => {
    const field = {
      width: 10,
      height: 10,
      particles: [fixedParticle({ vx: 1, vy: 0, life: 5000 })],
    };
    const next = stepField(field, 1000);
    expect(next.particles[0]?.x).toBeCloseTo(1);
    expect(next.particles[0]?.age).toBe(1000);
  });

  test('applies acceleration to velocity', () => {
    const field = {
      width: 10,
      height: 10,
      particles: [fixedParticle({ vy: 0, ay: 2, life: 5000 })],
    };
    const next = stepField(field, 1000);
    expect(next.particles[0]?.vy).toBeCloseTo(2);
  });

  test('drops particles whose age has reached life', () => {
    const field = { width: 10, height: 10, particles: [fixedParticle({ age: 900, life: 1000 })] };
    const next = stepField(field, 200);
    expect(next.particles).toHaveLength(0);
  });

  test('emitter contributes fresh particles', () => {
    const emitter: Emitter = {
      spawn: () => [fixedParticle({ x: 5 })],
    };
    const next = stepField(emptyField(10, 10), 100, emitter, RNG);
    expect(next.particles).toHaveLength(1);
    expect(next.particles[0]?.x).toBe(5);
  });

  test('never mutates the input field', () => {
    const field = { width: 10, height: 10, particles: [fixedParticle()] };
    stepField(field, 100);
    expect(field.particles).toHaveLength(1);
  });
});

describe('renderField', () => {
  test('places a particle at its rounded grid position', () => {
    const sprite = renderField({
      width: 5,
      height: 3,
      particles: [fixedParticle({ x: 2.4, y: 1.6 })],
    });
    expect(sprite.rows[2]?.[2]?.ch).toBe('A');
  });

  test('drops particles outside the canvas', () => {
    const sprite = renderField({
      width: 3,
      height: 3,
      particles: [fixedParticle({ x: 10, y: 10 })],
    });
    expect(sprite.rows.every((r) => r.every((c) => c === null))).toBe(true);
  });

  test('picks a later glyph as life-fraction grows', () => {
    const sprite = renderField({
      width: 1,
      height: 1,
      particles: [fixedParticle({ x: 0, y: 0, age: 800, life: 1000, chars: ['A', 'B'] })],
    });
    expect(sprite.rows[0]?.[0]?.ch).toBe('B');
  });
});

describe('rateEmitter', () => {
  test('honors rate over multiple steps', () => {
    const emitter = rateEmitter({
      origin: { x: 0, y: 0, w: 1, h: 1 },
      rate: 10,
      make: () => fixedParticle(),
    });
    let total = 0;
    for (let i = 0; i < 100; i += 1) {
      total += emitter.spawn(10, RNG).length;
    }
    expect(total).toBe(10);
  });

  test('respects limit', () => {
    const emitter = rateEmitter({
      origin: { x: 0, y: 0, w: 1, h: 1 },
      rate: 1000,
      limit: 3,
      make: () => fixedParticle(),
    });
    const total = emitter.spawn(1000, RNG).length;
    expect(total).toBe(3);
  });

  test('stops emitting past duration', () => {
    const emitter = rateEmitter({
      origin: { x: 0, y: 0, w: 1, h: 1 },
      rate: 100,
      duration: 500,
      make: () => fixedParticle(),
    });
    expect(emitter.spawn(400, RNG).length).toBeGreaterThan(0);
    emitter.spawn(200, RNG);
    expect(emitter.spawn(100, RNG)).toHaveLength(0);
  });
});

describe('built-in emitters', () => {
  test('every preset returns at least one particle when stepped enough', () => {
    const origin = { x: 0, y: 0, w: 4, h: 2 };
    for (const make of [sparkles, hearts, notes, zZz, confetti]) {
      const e = make(origin);
      let any = 0;
      for (let i = 0; i < 50; i += 1) {
        any += e.spawn(100, RNG).length;
      }
      expect(any).toBeGreaterThan(0);
    }
  });
});
