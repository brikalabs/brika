/**
 * Emote script DSL — emotes are a list of "beats" interpreted by a
 * tiny physics simulator. The compiler runs the script offline, takes
 * one snapshot per simulation tick, and packs the result into a
 * regular `Clip` so the existing Timeline / `useTimeline` machinery
 * plays it without changes.
 *
 *   defineEmote('hop', {
 *     line: '{:cheeky:}wheee!',
 *     initial: { face: 'happy' },
 *     beats: [
 *       { kind: 'tween', h: 2, ms: 100 },           // squat (anticipation)
 *       { kind: 'tween', h: 4, ms: 100 },           // stretch (launch)
 *       { kind: 'face', face: 'starry' },
 *       { kind: 'impulse', vx: 5, vy: 11 },          // physical launch
 *       { kind: 'waitLand' },                       // gravity does the arc
 *       { kind: 'tween', h: 2, ms: 100 },           // landing squash
 *       { kind: 'tween', h: 3, ms: 150 },           // settle
 *       { kind: 'wait', ms: 200 },
 *     ],
 *   })
 *
 * Beats:
 *   - `wait { ms }`          – simulate physics for `ms` ms (gravity
 *                              applies; body keeps current velocity).
 *   - `face { face }`        – swap the rendered face.
 *   - `set { ... }`          – teleport state (no easing).
 *   - `tween { …, ms }`      – ease w/h/cx toward targets over `ms`,
 *                              while physics keeps integrating.
 *   - `impulse { vx, vy }`   – add to current velocity (e.g. jump).
 *   - `waitLand { maxMs }`   – simulate until feet touch the floor.
 */

import { renderBrick } from '../brick';
import type { Mood } from '../moods';
import type { Origin } from '../particleEmitters';
import type { Emitter } from '../particles';
import { type BrickState, makeBrick, step } from '../physics';
import type { Sprite } from '../sprite';
import { FACE_BY_NAME, type FaceName, STAGE_GEOM } from '../stageSprites';
import { clip, timeline } from '../timeline';
import type { EmoteDef, EmoteFrameState } from './types';

export type FaceInput = FaceName | Sprite;

export type Beat =
  | { readonly kind: 'wait'; readonly ms: number }
  | { readonly kind: 'face'; readonly face: FaceInput }
  | {
      readonly kind: 'set';
      readonly cx?: number;
      readonly w?: number;
      readonly h?: number;
      readonly vx?: number;
      readonly vy?: number;
      readonly y?: number;
    }
  | {
      readonly kind: 'tween';
      readonly cx?: number;
      readonly w?: number;
      readonly h?: number;
      readonly ms: number;
      readonly ease?: 'linear' | 'easeIn' | 'easeOut';
    }
  | { readonly kind: 'impulse'; readonly vx?: number; readonly vy?: number }
  | { readonly kind: 'waitLand'; readonly maxMs?: number };

export interface EmoteSpec {
  readonly mood?: Mood;
  readonly color?: string;
  readonly line?: string;
  readonly hold?: number;
  readonly priority?: number;
  readonly loop?: boolean;
  readonly particles?: (origin: Origin) => Emitter;
  /** Simulation frame rate. Default 30 (≈33ms per snapshot). */
  readonly fps?: number;
  /** Initial physics + face state. */
  readonly initial?: {
    readonly cx?: number;
    readonly w?: number;
    readonly h?: number;
    readonly face?: FaceInput;
  };
  readonly beats: ReadonlyArray<Beat>;
}

/** Build the `BrickState` seed from `spec.initial`, dropping `undefined`
 *  keys so `makeBrick`'s own defaults (cx=7, w=5, h=3 …) win for the
 *  fields the emote doesn't pin. */
function initialPhysics(initial: EmoteSpec['initial']): Partial<BrickState> {
  if (!initial) {
    return {};
  }
  const out: { -readonly [K in keyof BrickState]?: BrickState[K] } = {};
  if (initial.cx !== undefined) {
    out.cx = initial.cx;
  }
  if (initial.w !== undefined) {
    out.w = initial.w;
  }
  if (initial.h !== undefined) {
    out.h = initial.h;
  }
  return out;
}

function resolveFace(face: FaceInput | undefined, fallback: Sprite): Sprite {
  if (face === undefined) {
    return fallback;
  }
  if (typeof face === 'string') {
    return FACE_BY_NAME[face];
  }
  return face;
}

function ease(t: number, kind: 'linear' | 'easeIn' | 'easeOut' = 'linear'): number {
  switch (kind) {
    case 'easeIn':
      return t * t;
    case 'easeOut':
      return 1 - (1 - t) * (1 - t);
    default:
      return t;
  }
}

export function defineEmote(name: string, spec: Readonly<EmoteSpec>): EmoteDef {
  const fps = spec.fps ?? 30;
  const stepMs = 1000 / fps;

  const frames: Sprite[] = [];
  const durations: number[] = [];
  const states: EmoteFrameState[] = [];

  let physics: BrickState = makeBrick(initialPhysics(spec.initial));
  let face: Sprite = resolveFace(spec.initial?.face, FACE_BY_NAME.neutral);

  function snapshot(ms: number): void {
    frames.push(renderBrick({ ...physics, face }, STAGE_GEOM));
    durations.push(ms);
    states.push({ cx: physics.cx, w: physics.w, h: physics.h, y: physics.y, face });
  }

  function simulate(ms: number, onTick?: (t: number) => void): void {
    const steps = Math.max(1, Math.round(ms / stepMs));
    for (let i = 1; i <= steps; i += 1) {
      onTick?.(i / steps);
      physics = step(physics, stepMs);
      snapshot(stepMs);
    }
  }

  for (const beat of spec.beats) {
    switch (beat.kind) {
      case 'face':
        face = resolveFace(beat.face, face);
        break;
      case 'set':
        physics = {
          ...physics,
          cx: beat.cx ?? physics.cx,
          w: beat.w ?? physics.w,
          h: beat.h ?? physics.h,
          vx: beat.vx ?? physics.vx,
          vy: beat.vy ?? physics.vy,
          y: beat.y ?? physics.y,
        };
        snapshot(stepMs);
        break;
      case 'impulse':
        physics = {
          ...physics,
          vx: physics.vx + (beat.vx ?? 0),
          vy: physics.vy + (beat.vy ?? 0),
          grounded: false,
        };
        break;
      case 'wait':
        simulate(beat.ms);
        break;
      case 'tween': {
        const startW = physics.w;
        const startH = physics.h;
        const startCx = physics.cx;
        const endW = beat.w ?? startW;
        const endH = beat.h ?? startH;
        const endCx = beat.cx ?? startCx;
        simulate(beat.ms, (t) => {
          const e = ease(t, beat.ease);
          physics = {
            ...physics,
            w: startW + (endW - startW) * e,
            h: startH + (endH - startH) * e,
            cx: startCx + (endCx - startCx) * e,
          };
        });
        break;
      }
      case 'waitLand': {
        const maxMs = beat.maxMs ?? 3000;
        let elapsed = 0;
        // Step at least once so a same-tick impulse can lift off
        // before we test for "landed".
        physics = step(physics, stepMs);
        snapshot(stepMs);
        elapsed += stepMs;
        while (elapsed < maxMs && !(physics.grounded && physics.vy === 0)) {
          physics = step(physics, stepMs);
          snapshot(stepMs);
          elapsed += stepMs;
        }
        break;
      }
    }
  }

  const animation = clip(frames, durations, { loop: spec.loop });
  return {
    name,
    timeline: timeline([{ clip: animation, delay: 0 }], { loop: spec.loop }),
    states,
    mood: spec.mood,
    color: spec.color,
    line: spec.line,
    hold: spec.hold,
    priority: spec.priority,
    particles: spec.particles,
  };
}
