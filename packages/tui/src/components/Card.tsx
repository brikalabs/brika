/**
 * Bordered section with a colored title — used for grouping related
 * content (a single keybind category, one dependency layer, etc.).
 *
 *   <Card title="Navigation" accent="cyan">
 *     …content…
 *   </Card>
 *
 * The title sits flush against the top-left corner like a chapter
 * heading. Compared to a plain `<Box borderStyle="single">` it makes
 * sections feel distinct without being heavy — the dim brackets and
 * accent color give it just enough weight to read as a card.
 *
 * Pass `onPress` to make the entire card a click target — wires the
 * shared `useClickable` hook so the affordance feels consistent with
 * `<Button>` / `<MenuBar>` / `<TabsTrigger>`.
 */

import { Box, type DOMElement, Text } from 'ink';
import type React from 'react';
import { useRef } from 'react';
import { useClickable } from '../mouse/useClickable';

export interface CardProps {
  readonly title: string;
  readonly accent?: string;
  /** Optional tag/subtitle shown right of the title (e.g. layer count). */
  readonly tag?: string;
  /** Fire when the user left-clicks anywhere on the card. */
  readonly onPress?: () => void;
  readonly children: React.ReactNode;
}

export function Card({
  title,
  accent = 'cyan',
  tag,
  onPress,
  children,
}: Readonly<CardProps>): React.ReactElement {
  const ref = useRef<DOMElement>(null);
  useClickable(ref, onPress);
  return (
    <Box
      ref={ref}
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      paddingY={0}
    >
      <Box marginBottom={0}>
        <Text bold color={accent}>
          {title}
        </Text>
        {tag && (
          <>
            <Text dimColor>{'  '}</Text>
            <Text dimColor>{tag}</Text>
          </>
        )}
      </Box>
      {children}
    </Box>
  );
}
