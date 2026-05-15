/**
 * `useParticles` — React adapter that runs the particle simulation
 * on its own interval and returns the rasterized layer as a Sprite.
 * Resets when the emitter identity changes so an emote swap doesn't
 * inherit the previous emote's particles.
 */

import { useEffect, useState } from 'react';
import { type Emitter, emptyField, type ParticleField, renderField, stepField } from './particles';
import { makeRng } from './rng';
import { EMPTY_SPRITE, type Sprite } from './sprite';

export interface UseParticlesOpts {
  readonly width: number;
  readonly height: number;
  /** Simulation rate. Default 24. Clamped so the interval is at least 16ms. */
  readonly fps?: number;
  readonly seed?: number;
  readonly active?: boolean;
}

function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] ?? 1;
}

export function useParticles(emitter: Emitter | null, opts: UseParticlesOpts): Sprite {
  const { width, height, fps = 24, seed, active = true } = opts;
  const [field, setField] = useState<ParticleField>(() => emptyField(width, height));

  useEffect(() => {
    if (!active) {
      return;
    }
    if (!emitter && field.particles.length === 0) {
      return;
    }
    const rng = makeRng(seed ?? randomSeed());
    const interval = Math.max(16, Math.floor(1000 / fps));
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = now - last;
      last = now;
      setField((f) => stepField(f, dt, emitter, rng));
    }, interval);
    return () => clearInterval(id);
    // field.particles.length intentionally not a dep — the effect should
    // only start/stop on emitter changes, not every particle update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emitter, fps, seed, active]);

  useEffect(() => {
    setField((f) => (f.width === width && f.height === height ? f : { ...f, width, height }));
  }, [width, height]);

  useEffect(() => {
    setField((f) => ({ ...f, particles: [] }));
  }, [emitter]);

  if (field.particles.length === 0) {
    return width === 0 || height === 0 ? EMPTY_SPRITE : renderField(field);
  }
  return renderField(field);
}
