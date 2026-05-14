/**
 * `<BrixAnimated kind="thinking" />` — cycles through an animation's
 * frames on its built-in interval. Stops when unmounted.
 *
 *   <BrixAnimated kind="loading" />
 *   <BrixAnimated kind="startup" loop={false} onEnd={() => …} />
 *
 * Most animations loop. `startup` is intentionally one-shot (lands on
 * "runtime ready") — pass `loop={false}` and read `onEnd` if you want
 * to chain another component after it finishes.
 */

import { Text } from 'ink';
import type React from 'react';
import { useEffect, useState } from 'react';
import { ANIMATIONS, type AnimationKind } from './animations';

export interface BrixAnimatedProps {
  readonly kind: AnimationKind;
  readonly color?: string;
  readonly bold?: boolean;
  /** Loop the frames once they reach the end. Default true. */
  readonly loop?: boolean;
  /** Callback fired when a non-looping animation reaches its last frame. */
  readonly onEnd?: () => void;
  /** Override the animation's built-in interval. */
  readonly intervalMs?: number;
}

export function BrixAnimated({
  kind,
  color,
  bold,
  loop = true,
  onEnd,
  intervalMs,
}: Readonly<BrixAnimatedProps>): React.ReactElement {
  const { frames, intervalMs: defaultInterval } = ANIMATIONS[kind];
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setFrame((current) => {
        const next = current + 1;
        if (next >= frames.length) {
          if (loop) {
            return 0;
          }
          onEnd?.();
          return frames.length - 1;
        }
        return next;
      });
    }, intervalMs ?? defaultInterval);
    return () => clearInterval(t);
  }, [frames.length, intervalMs, defaultInterval, loop, onEnd]);

  return (
    <Text color={color} bold={bold}>
      {frames[frame]}
    </Text>
  );
}
