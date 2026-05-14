/**
 * `<BrixAnimated kind="thinking" />` — walks the named animation's
 * frame set on its built-in interval. Stops when unmounted.
 *
 *   <BrixAnimated kind="loading" />
 *   <BrixAnimated kind="startup" loop={false} onEnd={() => …} />
 *
 * Most animations loop. One-shots (`startup`, `wink`, `blink`, …)
 * declare `loop: false` in their `Animation` definition, so callers
 * don't have to pass `loop={false}` unless they want to override.
 *
 * The actual tick/loop/onEnd plumbing lives in `useFrameSeq` — this
 * component is just a thin Ink wrapper around it.
 */

import { Text } from 'ink';
import type React from 'react';
import { ANIMATIONS, type AnimationKind } from './animations';
import { useFrameSeq } from './useFrameSeq';

export interface BrixAnimatedProps {
  readonly kind: AnimationKind;
  readonly color?: string;
  readonly bold?: boolean;
  /** Override the animation's default loop flag. */
  readonly loop?: boolean;
  /** Fires once when a non-looping animation reaches its last frame. */
  readonly onEnd?: () => void;
  /** Override the animation's built-in interval. */
  readonly intervalMs?: number;
}

export function BrixAnimated({
  kind,
  color,
  bold,
  loop,
  onEnd,
  intervalMs,
}: Readonly<BrixAnimatedProps>): React.ReactElement {
  const { frame } = useFrameSeq(ANIMATIONS[kind], { loop, intervalMs, onEnd });
  return (
    <Text color={color} bold={bold}>
      {frame}
    </Text>
  );
}
