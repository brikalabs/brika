/**
 * `useTimeline` — React adapter that drives a `Timeline` on a single
 * interval and returns the composited frame at "now". Looping
 * timelines never call `onEnd`; non-looping ones fire it exactly once
 * when the cursor first crosses `timelineDuration`.
 *
 *   const { sprite, done } = useTimeline(myTimeline, { fps: 30 });
 */

import { useEffect, useRef, useState } from 'react';
import { compose, EMPTY_SPRITE, type Sprite } from './sprite';
import { type Timeline, timelineDone, timelineDuration, tracksAt } from './timeline';

export interface UseTimelineOptions {
  /** Render rate. Default 30. Clamped so the interval is at least 16ms. */
  readonly fps?: number;
  /** Fires once when a non-looping timeline reaches its total duration. */
  readonly onEnd?: () => void;
  /** Pauses the clock when false. Default true. */
  readonly active?: boolean;
}

export interface TimelineState {
  readonly sprite: Sprite;
  readonly t: number;
  readonly done: boolean;
}

export function useTimeline(tl: Timeline, opts: UseTimelineOptions = {}): TimelineState {
  const fps = opts.fps ?? 30;
  const interval = Math.max(16, Math.floor(1000 / fps));
  const active = opts.active ?? true;
  const [t, setT] = useState(0);

  // Stash onEnd in a ref so the clock effect can read the latest
  // callback without re-binding (which would restart the interval).
  const onEndRef = useRef(opts.onEnd);
  onEndRef.current = opts.onEnd;

  useEffect(() => {
    if (!active) {
      return;
    }
    const start = Date.now();
    setT(0);
    const total = timelineDuration(tl);
    let endFired = false;
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      setT(elapsed);
      if (!tl.loop && !endFired && elapsed >= total) {
        endFired = true;
        onEndRef.current?.();
        clearInterval(id);
      }
    }, interval);
    return () => clearInterval(id);
  }, [tl, interval, active]);

  const sprites = tracksAt(tl, t);
  let sprite: Sprite;
  if (sprites.length === 0) {
    sprite = EMPTY_SPRITE;
  } else if (sprites.length === 1) {
    sprite = sprites[0] ?? EMPTY_SPRITE;
  } else {
    sprite = compose(sprites);
  }
  return { sprite, t, done: timelineDone(tl, t) };
}
