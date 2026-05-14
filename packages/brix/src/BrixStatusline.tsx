/**
 * `<BrixStatusline mood="…" text="…" />` — one-line status, intended
 * for footers, TUI overlays, or as the only line in a compact mode.
 *
 *   (◔◡◔) building automation graph
 *   (^◡^) runtime ready
 *   (•~•) waiting for filesystem events
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { Brix } from './Brix';
import type { Bracket, Mood } from './moods';

export interface BrixStatuslineProps {
  readonly text: string;
  readonly mood?: Mood;
  readonly bracket?: Bracket;
  /** Color the face glyph (text stays default). Default cyan. */
  readonly faceColor?: string;
}

export function BrixStatusline({
  text,
  mood = 'idle',
  bracket = 'round',
  faceColor = 'cyan',
}: Readonly<BrixStatuslineProps>): React.ReactElement {
  return (
    <Box>
      <Brix mood={mood} bracket={bracket} color={faceColor} />
      <Text> {text}</Text>
    </Box>
  );
}
