/**
 * `<Tombstone>` — minimal headstone that replaces Brix on the stage
 * during the "dead" phase after he's been poked to death.
 *
 *      ╭───╮
 *      │   │
 *      │RIP│
 *      │   │
 *      └───┘
 *   ~"~"~"~"~"~
 *
 * Intentionally spartan: the only inscription is RIP. The epitaph
 * shown in the speech bubble (frozen via `useBubbleStream`'s `frozen`
 * flag) carries the narrative; the stone just signals "Brix is dead".
 */

import { Box, Text } from 'ink';
import type React from 'react';

export interface TombstoneProps {
  readonly width: number;
  readonly height: number;
}

export function Tombstone({ width, height }: Readonly<TombstoneProps>): React.ReactElement {
  return (
    <Box
      width={width}
      height={height}
      flexDirection="column"
      alignItems="center"
      justifyContent="flex-end"
    >
      <Text color="gray">╭───╮</Text>
      <Text color="gray">│   │</Text>
      <Box>
        <Text color="gray">│</Text>
        <Text color="red" bold>
          RIP
        </Text>
        <Text color="gray">│</Text>
      </Box>
      <Text color="gray">│   │</Text>
      <Text color="gray">└───┘</Text>
      <Text color="green" dimColor>
        {grassFor(width)}
      </Text>
    </Box>
  );
}

/** Pattern a grass row across the full stage width so the headstone
 *  sits in a continuous patch of ground instead of floating. */
function grassFor(width: number): string {
  const tufts = '~"~"';
  let out = '';
  while (out.length < width) {
    out += tufts;
  }
  return out.slice(0, width);
}
