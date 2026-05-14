/**
 * `useFrameSeq` — the single interval-driven engine behind every Brix
 * animation component. Walks an animation's frame list on its tick,
 * honors a `loop` override (falls back to the animation's own
 * `loop`, then to `true`), fires `onEnd` when a one-shot finishes,
 * and cleans up its timer on unmount.
 *
 *   const { frame, index, done } = useFrameSeq(ANIMATIONS.wave);
 *   const startup = useFrameSeq(ANIMATIONS.startup, { onEnd: () => exit() });
 *
 * Both `<BrixAnimated>` and the per-state face slots in `<BrixHost>`
 * sit on top of this — there is no other animation engine in the
 * package.
 */

import { useEffect, useRef, useState } from 'react';
import type { Animation } from './animations';

export interface FrameSeqOptions {
  /** Override the animation's default loop flag. */
  readonly loop?: boolean;
  /** Override the per-frame interval. */
  readonly intervalMs?: number;
  /** Fires once when a non-looping cycle reaches the last frame. */
  readonly onEnd?: () => void;
}

export interface FrameSeqState {
  /** The current frame string. Empty string if the animation has no frames. */
  readonly frame: string;
  /** The current frame index. */
  readonly index: number;
  /** True iff a non-looping animation has reached its last frame. */
  readonly done: boolean;
}

export function useFrameSeq(
  animation: Readonly<Animation>,
  options?: Readonly<FrameSeqOptions>
): FrameSeqState {
  const loop = options?.loop ?? animation.loop ?? true;
  const interval = options?.intervalMs ?? animation.intervalMs;
  const { frames } = animation;

  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);

  // Hold the latest onEnd in a ref so we don't tear down the interval
  // every time the caller passes a new inline arrow function.
  const onEndRef = useRef<(() => void) | undefined>(options?.onEnd);
  onEndRef.current = options?.onEnd;

  // Reset whenever the animation identity (frames array) changes.
  useEffect(() => {
    setIndex(0);
    setDone(false);
  }, [frames]);

  useEffect(() => {
    if (frames.length <= 1) {
      if (!loop && frames.length === 1 && !done) {
        // Single-frame one-shot — fire onEnd once and pin to index 0.
        setDone(true);
        onEndRef.current?.();
      }
      return;
    }
    if (done) {
      return;
    }
    const t = setInterval(() => {
      setIndex((cur) => {
        const next = cur + 1;
        if (next >= frames.length) {
          if (loop) {
            return 0;
          }
          setDone(true);
          onEndRef.current?.();
          return frames.length - 1;
        }
        return next;
      });
    }, interval);
    return () => clearInterval(t);
  }, [frames, interval, loop, done]);

  return {
    frame: frames[index] ?? '',
    index,
    done,
  };
}
