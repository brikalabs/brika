/**
 * Keyboard-key glyph. Wraps a key label in subtle brackets + a color
 * accent so keybinds visually pop out of surrounding prose:
 *
 *   <Text>Press <Kbd>tab</Kbd> to switch tabs.</Text>
 *
 * Why not a background-colored block? ink's `backgroundColor` does
 * work, but on dark themes the contrast tends to fight the rest of
 * the chrome. Brackets + a single accent color render the same on
 * every terminal and don't depend on the user's color palette.
 */

import { Text } from 'ink';
import type React from 'react';

export interface KbdProps {
  readonly children: string;
  /** Accent color for the key label. Default yellow. */
  readonly color?: string;
}

export function Kbd({ children, color = 'yellow' }: Readonly<KbdProps>): React.ReactElement {
  return (
    <Text>
      <Text dimColor>[</Text>
      <Text color={color} bold>
        {children}
      </Text>
      <Text dimColor>]</Text>
    </Text>
  );
}
