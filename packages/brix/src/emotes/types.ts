/**
 * `EmoteDef` — the top-level "Brix does something on stage" object.
 * Bundles a Timeline (what the body/face do over time) with an
 * optional particle emitter, a speech line, and priority/hold
 * metadata used by the emote bus.
 *
 * Per-emote files (`./wave.ts`, `./celebrate.ts`, …) call
 * `defineEmote(...)` from `./builder.ts` to produce one of these.
 * The aggregated catalog lives in `./index.ts`.
 */

import type { Mood } from '../moods';
import type { Origin } from '../particleEmitters';
import type { Emitter } from '../particles';
import type { Sprite } from '../sprite';
import type { Timeline } from '../timeline';

/** Snapshot of the body's logical state at a single frame. Stored
 *  parallel to the rendered timeline frames so consumers (speaking
 *  overlay, transition bridges) can anchor effects to where Brix is
 *  *right now* without having to scrape the sprite. */
export interface EmoteFrameState {
  readonly cx: number;
  readonly w: number;
  readonly h: number;
  readonly y: number;
  readonly face: Sprite;
}

export interface EmoteDef {
  /** Stable name used by `play(name)` and event handlers. */
  readonly name: string;
  /** Animation timeline composing into the stage layer. */
  readonly timeline: Timeline;
  /** Per-frame body state, same length and order as the timeline's
   *  first clip's frames. Used by the stage to anchor face overlays
   *  (e.g. speaking-mouth) and future transition bridges. */
  readonly states: ReadonlyArray<EmoteFrameState>;
  /** Spawned at play time with the stage's origin rectangle. */
  readonly particles?: (origin: Origin) => Emitter;
  /** Optional bubble line — `{:mood:}` tokens supported. */
  readonly line?: string;
  /** Mood used for tinting / bubble color choices. */
  readonly mood?: Mood;
  /** Body/particle tint. Default chosen from `mood`. */
  readonly color?: string;
  /** Higher = harder to interrupt. Default 0. */
  readonly priority?: number;
  /** Extra ms to hold the final frame before returning control. */
  readonly hold?: number;
}
