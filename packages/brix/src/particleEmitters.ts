/**
 * Built-in particle emitters. Each one is a small factory that takes
 * an `Origin` rectangle (in field cells) plus tuning and returns an
 * `Emitter`. The emitter accumulates "particles owed" based on its
 * spawn rate and dt — fractional carry-over is preserved so a `rate:
 * 8` emitter actually fires 8 particles per second regardless of the
 * step size.
 *
 *   const emitter = sparkles({ x: 1, y: 0, w: 7, h: 2 });
 *   //   ✦ · ✧            scattered glyphs that drift up and fade.
 */

import type { Emitter, Particle } from './particles';

export interface Origin {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface RateEmitterOpts {
  readonly origin: Origin;
  readonly rate: number;
  readonly make: (rng: () => number, origin: Origin) => Particle;
  /** Max total particles. -1 = unlimited. */
  readonly limit?: number;
  /** Lifetime of the emitter itself, ms. -1 = unlimited. */
  readonly duration?: number;
}

/** Generic rate-based emitter. We track total elapsed and total
 *  spawned, then derive how many particles we owe via integer floor —
 *  this is drift-free even across thousands of small dt steps where a
 *  simple `acc += dt*rate` accumulator would lose particles to float
 *  rounding. */
export function rateEmitter(opts: RateEmitterOpts): Emitter {
  let spawned = 0;
  let elapsed = 0;
  const limit = opts.limit ?? -1;
  const duration = opts.duration ?? -1;
  return {
    spawn(dt, rng) {
      elapsed += dt;
      const active = duration < 0 ? elapsed : Math.min(elapsed, duration);
      const owed = Math.floor((active / 1000) * opts.rate) - spawned;
      if (owed <= 0) {
        return [];
      }
      const out: Particle[] = [];
      for (let i = 0; i < owed; i += 1) {
        if (limit >= 0 && spawned >= limit) {
          break;
        }
        out.push(opts.make(rng, opts.origin));
        spawned += 1;
      }
      return out;
    },
  };
}

function pointInArea(rng: () => number, o: Origin): { x: number; y: number } {
  return { x: o.x + rng() * o.w, y: o.y + rng() * o.h };
}

export const SPARKLE_CHARS = ['✦', '✧', '·'] as const;
export const HEART_CHARS = ['♡', '♥', '♡', '·'] as const;
export const NOTE_CHARS = ['♪', '♫', '·'] as const;
export const Z_CHARS = ['z', 'Z', 'z', '·'] as const;
export const CONFETTI_CHARS = ['*', '+', '·'] as const;
export const TEAR_CHARS = ['•', '·', ',', "'"] as const;

export interface EmitterTuning {
  readonly rate?: number;
  readonly duration?: number;
  readonly color?: string;
}

export function sparkles(origin: Origin, opts?: EmitterTuning): Emitter {
  return rateEmitter({
    origin,
    rate: opts?.rate ?? 8,
    duration: opts?.duration ?? -1,
    make: (rng, o) => {
      const p = pointInArea(rng, o);
      return {
        x: p.x,
        y: p.y,
        vx: (rng() - 0.5) * 1,
        vy: -0.6 - rng() * 0.4,
        ax: 0,
        ay: 0.6,
        age: 0,
        life: 800 + rng() * 400,
        chars: SPARKLE_CHARS,
        color: opts?.color ?? 'yellow',
        bold: true,
      };
    },
  });
}

export function hearts(origin: Origin, opts?: EmitterTuning): Emitter {
  return rateEmitter({
    origin,
    rate: opts?.rate ?? 3,
    duration: opts?.duration ?? -1,
    make: (rng, o) => {
      const p = pointInArea(rng, o);
      return {
        x: p.x,
        y: p.y,
        vx: (rng() - 0.5) * 0.8,
        vy: -0.8,
        ax: 0,
        ay: 0,
        age: 0,
        life: 1400,
        chars: HEART_CHARS,
        color: opts?.color ?? 'magenta',
      };
    },
  });
}

export function notes(origin: Origin, opts?: EmitterTuning): Emitter {
  return rateEmitter({
    origin,
    rate: opts?.rate ?? 4,
    duration: opts?.duration ?? -1,
    make: (rng, o) => {
      const p = pointInArea(rng, o);
      return {
        x: p.x,
        y: p.y,
        vx: rng() * 1.5 - 0.2,
        vy: -1.0,
        ax: 0,
        ay: 0.2,
        age: 0,
        life: 1200,
        chars: NOTE_CHARS,
        color: opts?.color ?? 'cyan',
      };
    },
  });
}

export function zZz(origin: Origin, opts?: EmitterTuning): Emitter {
  return rateEmitter({
    origin,
    rate: opts?.rate ?? 1.2,
    duration: opts?.duration ?? -1,
    make: (rng, o) => {
      const p = pointInArea(rng, o);
      return {
        x: p.x,
        y: p.y,
        vx: 0.3,
        vy: -0.4,
        ax: 0,
        ay: 0,
        age: 0,
        life: 2400,
        chars: Z_CHARS,
        color: opts?.color ?? 'gray',
        dim: true,
      };
    },
  });
}

const CONFETTI_PALETTE = ['red', 'yellow', 'green', 'cyan', 'magenta', 'white'] as const;

/** Slow tear drops trickling DOWN from the origin. Used by the
 *  `cry` emote — short life so they fade before piling up. */
export function tears(origin: Origin, opts?: EmitterTuning): Emitter {
  return rateEmitter({
    origin,
    rate: opts?.rate ?? 1.4,
    duration: opts?.duration ?? -1,
    make: (rng, o) => {
      const p = pointInArea(rng, o);
      return {
        x: p.x,
        y: p.y,
        vx: (rng() - 0.5) * 0.2,
        vy: 0.55 + rng() * 0.25,
        ax: 0,
        ay: 0.2,
        age: 0,
        life: 1400 + rng() * 400,
        chars: TEAR_CHARS,
        color: opts?.color ?? 'blue',
        dim: true,
      };
    },
  });
}

export function confetti(origin: Origin, opts?: EmitterTuning): Emitter {
  return rateEmitter({
    origin,
    rate: opts?.rate ?? 18,
    duration: opts?.duration ?? 1200,
    make: (rng, o) => {
      const p = pointInArea(rng, o);
      const color =
        opts?.color ?? CONFETTI_PALETTE[Math.floor(rng() * CONFETTI_PALETTE.length)] ?? 'white';
      return {
        x: p.x,
        y: p.y,
        vx: (rng() - 0.5) * 3,
        vy: -1.6 - rng() * 0.8,
        ax: 0,
        ay: 2.2,
        age: 0,
        life: 1600 + rng() * 400,
        chars: CONFETTI_CHARS,
        color,
        bold: true,
      };
    },
  });
}
