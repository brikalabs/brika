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
 * Pass `onPress` to make the entire card a click + Tab + Enter target.
 */

import { Box, type DOMElement, Text } from 'ink';
import type React from 'react';
import { useRef } from 'react';
import { useFocusable } from '../keys/useFocusable';

export interface CardProps {
  readonly title: string;
  readonly accent?: string;
  /** Optional tag/subtitle shown right of the title (e.g. layer count). */
  readonly tag?: string;
  /** Fire when the user clicks the card or hits Enter / Space while it
   *  has focus. Cards without an `onPress` aren't focusable. */
  readonly onPress?: () => void;
  /** DOM-style tab order — `-1` opts out of the Tab cycle. Default `0`. */
  readonly tabIndex?: number;
  /** Stable focus id. Auto-generated when omitted. */
  readonly id?: string;
  readonly children: React.ReactNode;
}

export function Card({
  title,
  accent = 'cyan',
  tag,
  onPress,
  tabIndex,
  id,
  children,
}: Readonly<CardProps>): React.ReactElement {
  const ref = useRef<DOMElement>(null);
  const { isFocused } = useFocusable({
    id,
    tabIndex,
    onPress,
    enabled: Boolean(onPress),
    ref,
  });
  const focusable = Boolean(onPress);
  return (
    <Box
      ref={ref}
      flexDirection="column"
      borderStyle={focusable && isFocused ? 'bold' : 'round'}
      borderColor={focusable && isFocused ? accent : 'gray'}
      borderDimColor={!focusable || !isFocused}
      paddingX={1}
      paddingY={0}
    >
      <Box marginBottom={0}>
        {focusable && isFocused ? <Text color={accent}>▸ </Text> : null}
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
