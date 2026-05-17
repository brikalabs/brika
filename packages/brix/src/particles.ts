/**
 * Tiny particle field for sprite-grid space. Each particle has a
 * position, velocity, and acceleration in *cells per second* — the
 * simulation steps in ms and integrates with the standard explicit
 * Euler `x += v*dt; v += a*dt`. A particle's `chars` list maps the
 * fraction of its life elapsed to a glyph, so authors can stage a
 * sparkle ⇒ fade with a 3-entry array.
 *
 *   step → step → step  (advect + age)
 *           ▼
 *        renderField()    → Sprite (one layer, ready to composite)
 *
 * Emitters live in `particleEmitters.ts` — this file is just the
 * simulation kernel.
 */

import type { Cell, Sprite } from './sprite';

export interface Particle {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly ax: number;
  readonly ay: number;
  /** ms since spawn. */
  readonly age: number;
  /** total lifetime in ms; particle dies at age >= life. */
  readonly life: number;
  /** glyph palette over lifetime — index = floor((age/life) * chars.length). */
  readonly chars: ReadonlyArray<string>;
  readonly color?: string;
  readonly dim?: boolean;
  readonly bold?: boolean;
}

export interface ParticleField {
  readonly width: number;
  readonly height: number;
  readonly particles: ReadonlyArray<Particle>;
}

export interface Emitter {
  /** Returns new particles to spawn this step. `dtMs` is the step size,
   *  `rng` returns a value in [0,1). */
  spawn(dtMs: number, rng: () => number): ReadonlyArray<Particle>;
}

export function emptyField(width: number, height: number): ParticleField {
  return { width, height, particles: [] };
}

/** Advect every particle by `dtMs`, drop dead ones, then append fresh
 *  spawn from the emitter. Returns a new field — never mutates input. */
export function stepField(
  field: ParticleField,
  dtMs: number,
  emitter?: Emitter | null,
  rng?: () => number
): ParticleField {
  const dt = dtMs / 1000;
  const next: Particle[] = [];
  for (const p of field.particles) {
    const age = p.age + dtMs;
    if (age >= p.life) {
      continue;
    }
    const vx = p.vx + p.ax * dt;
    const vy = p.vy + p.ay * dt;
    next.push({
      ...p,
      age,
      vx,
      vy,
      x: p.x + vx * dt,
      y: p.y + vy * dt,
    });
  }
  if (emitter && rng) {
    for (const p of emitter.spawn(dtMs, rng)) {
      next.push(p);
    }
  }
  return { width: field.width, height: field.height, particles: next };
}

/** Pick the glyph for a particle's current age. */
function glyphFor(p: Particle): string | null {
  if (p.chars.length === 0 || p.life <= 0) {
    return null;
  }
  const i = Math.min(p.chars.length - 1, Math.floor((p.age / p.life) * p.chars.length));
  return p.chars[i] ?? null;
}

/** Rasterize the field to a Sprite. Out-of-bounds particles are dropped. */
export function renderField(field: ParticleField): Sprite {
  const rows: (Cell | null)[][] = [];
  for (let r = 0; r < field.height; r += 1) {
    const row: (Cell | null)[] = [];
    for (let c = 0; c < field.width; c += 1) {
      row.push(null);
    }
    rows.push(row);
  }
  for (const p of field.particles) {
    const col = Math.round(p.x);
    const row = Math.round(p.y);
    if (col < 0 || row < 0 || col >= field.width || row >= field.height) {
      continue;
    }
    const ch = glyphFor(p);
    if (!ch) {
      continue;
    }
    const target = rows[row];
    if (target) {
      target[col] = { ch, color: p.color, dim: p.dim, bold: p.bold };
    }
  }
  return { width: field.width, height: field.height, rows };
}
