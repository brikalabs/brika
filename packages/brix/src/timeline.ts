/**
 * Timeline engine — the "complex animation" layer. A `Clip` is a list
 * of pre-composed sprite frames with per-frame durations. A `Timeline`
 * is a set of `Tracks` running in parallel; each track plays a clip
 * after an optional `delay`. Multiple visible tracks composite into a
 * single sprite via `compose`.
 *
 *   const wave = clip([f1, f2, f3, f4], 180, { loop: false });
 *   const sparkleBurst = clip([s1, s2, s3], 120);
 *   const tl = parallel([wave, sparkleBurst]);
 *
 * Sequence semantics: `sequence([a, b])` packs `b` to start right
 * after `a` finishes. Parallel: every clip starts at t=0.
 *
 * Everything here is pure data + pure math — `useTimeline` is the
 * React adapter that drives the clock.
 */

import type { Sprite } from './sprite';

export interface Clip {
  readonly frames: ReadonlyArray<Sprite>;
  /** Number = uniform ms per frame. Array = per-frame; missing entries
   *  fall back to the array's last value. */
  readonly durations: number | ReadonlyArray<number>;
  /** Default loop policy for this clip. Overridable at the Track level. */
  readonly loop?: boolean;
}

export interface Track {
  readonly clip: Clip;
  /** Start offset within the parent timeline, ms. Default 0. */
  readonly delay?: number;
  /** When true, a non-looping track stops contributing a frame after
   *  its clip ends (instead of pinning the last frame). `sequence`
   *  uses this so packed clips don't bleed into each other. */
  readonly hideAfterEnd?: boolean;
}

export interface Timeline {
  readonly tracks: ReadonlyArray<Track>;
  /** When true, the whole timeline loops once it reaches its total duration. */
  readonly loop?: boolean;
}

/** Duration of one clip iteration. Sum of per-frame durations. */
export function clipDuration(c: Clip): number {
  if (typeof c.durations === 'number') {
    return c.frames.length * c.durations;
  }
  let total = 0;
  for (let i = 0; i < c.frames.length; i += 1) {
    total += frameDuration(c, i);
  }
  return total;
}

/** Duration of frame `i` in clip `c`. */
function frameDuration(c: Clip, i: number): number {
  if (typeof c.durations === 'number') {
    return c.durations;
  }
  const arr = c.durations;
  return arr[i] ?? arr.at(-1) ?? 0;
}

/** Index of the frame visible at `localMs`, or -1 if the clip has no
 *  frames. Shares wrapping/clamping rules with `clipFrameAt`. */
export function clipFrameIndexAt(c: Clip, localMs: number): number {
  if (c.frames.length === 0) {
    return -1;
  }
  const total = clipDuration(c);
  if (total <= 0) {
    return 0;
  }
  const loop = c.loop ?? true;
  let t = localMs;
  if (loop) {
    t = ((t % total) + total) % total;
  } else if (t >= total) {
    return c.frames.length - 1;
  } else if (t < 0) {
    return 0;
  }
  let acc = 0;
  for (let i = 0; i < c.frames.length; i += 1) {
    acc += frameDuration(c, i);
    if (t < acc) {
      return i;
    }
  }
  return c.frames.length - 1;
}

/** Frame visible at local time `localMs` (already past any track delay). */
export function clipFrameAt(c: Clip, localMs: number): Sprite | null {
  const idx = clipFrameIndexAt(c, localMs);
  return idx >= 0 ? (c.frames[idx] ?? null) : null;
}

/** Total duration of the timeline (max end-time across its tracks). */
export function timelineDuration(tl: Timeline): number {
  let max = 0;
  for (const tr of tl.tracks) {
    const end = (tr.delay ?? 0) + clipDuration(tr.clip);
    if (end > max) {
      max = end;
    }
  }
  return max;
}

/** Sprites visible across all tracks at time `t`. Tracks that haven't
 *  started yet are skipped — they contribute nothing to compositing. */
export function tracksAt(tl: Timeline, t: number): ReadonlyArray<Sprite> {
  const total = timelineDuration(tl);
  let time = t;
  if (tl.loop && total > 0) {
    time = ((time % total) + total) % total;
  }
  const out: Sprite[] = [];
  for (const tr of tl.tracks) {
    const delay = tr.delay ?? 0;
    if (time < delay) {
      continue;
    }
    const local = time - delay;
    if (tr.hideAfterEnd && !(tr.clip.loop ?? true) && local >= clipDuration(tr.clip)) {
      continue;
    }
    const frame = clipFrameAt(tr.clip, local);
    if (frame) {
      out.push(frame);
    }
  }
  return out;
}

/** True iff a non-looping timeline has run past its total duration. */
export function timelineDone(tl: Timeline, t: number): boolean {
  if (tl.loop) {
    return false;
  }
  return t >= timelineDuration(tl);
}

// ── Builders ──────────────────────────────────────────────────────

export function clip(
  frames: ReadonlyArray<Sprite>,
  durations: number | ReadonlyArray<number>,
  opts?: { readonly loop?: boolean }
): Clip {
  return { frames, durations, loop: opts?.loop };
}

export function track(c: Clip, delay = 0): Track {
  return { clip: c, delay };
}

/** Pack clips back-to-back on a single timeline. The Nth clip starts
 *  at the cumulative duration of clips 0..N-1. */
export function sequence(clips: ReadonlyArray<Clip>, opts?: { readonly loop?: boolean }): Timeline {
  const tracks: Track[] = [];
  let offset = 0;
  for (let i = 0; i < clips.length; i += 1) {
    const c = clips[i];
    if (!c) {
      continue;
    }
    const isLast = i === clips.length - 1;
    tracks.push({ clip: c, delay: offset, hideAfterEnd: !isLast });
    offset += clipDuration(c);
  }
  return { tracks, loop: opts?.loop };
}

/** All clips start at t=0 and composite via `tracksAt`. */
export function parallel(clips: ReadonlyArray<Clip>, opts?: { readonly loop?: boolean }): Timeline {
  return { tracks: clips.map((c) => ({ clip: c, delay: 0 })), loop: opts?.loop };
}

/** Free-form timeline builder for hand-tuned delays. */
export function timeline(
  tracks: ReadonlyArray<Track>,
  opts?: { readonly loop?: boolean }
): Timeline {
  return { tracks, loop: opts?.loop };
}
