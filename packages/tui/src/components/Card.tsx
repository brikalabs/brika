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
 */

import { Box, Text } from 'ink';
import type React from 'react';

export interface CardProps {
  readonly title: string;
  readonly accent?: string;
  /** Optional tag/subtitle shown right of the title (e.g. layer count). */
  readonly tag?: string;
  readonly children: React.ReactNode;
}

export function Card({
  title,
  accent = 'cyan',
  tag,
  children,
}: Readonly<CardProps>): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} paddingY={0}>
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
