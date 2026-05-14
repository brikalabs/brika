/**
 * `<Brix mood="…" />` — the mascot's static face.
 *
 *   <Brix />                          // (◕◡◕)
 *   <Brix mood="happy" />             // (^◡^)
 *   <Brix mood="thinking" bracket="square" />   // [◔◡◔]
 *   <Brix mood="sleep" />             // (-◡-) zZ
 *
 * Inline-safe: single line, no padding, no border. Color defaults to
 * unset (terminal default) — pass `color` to tint the face.
 */

import { Text } from 'ink';
import type React from 'react';
import { type Bracket, faceOf, type Mood } from './moods';

export interface BrixProps {
  readonly mood?: Mood;
  readonly bracket?: Bracket;
  /** ink color name for the face glyph (cyan, yellow, red…). */
  readonly color?: string;
  /** Bold the face. Default false. */
  readonly bold?: boolean;
}

export function Brix({
  mood = 'default',
  bracket = 'round',
  color,
  bold,
}: Readonly<BrixProps>): React.ReactElement {
  return (
    <Text color={color} bold={bold}>
      {faceOf(mood, bracket)}
    </Text>
  );
}
