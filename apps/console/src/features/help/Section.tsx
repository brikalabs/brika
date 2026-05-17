import { Box, Text } from 'ink';
import type React from 'react';

interface SectionProps {
  readonly title: string;
  readonly items: ReadonlyArray<readonly [React.ReactElement, string]>;
}

export function Section({ title, items }: Readonly<SectionProps>): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold dimColor>
          {title.toUpperCase()}
        </Text>
      </Box>
      {items.map(([glyph, label], i) => (
        <Box key={`${title}-${i}`}>
          {glyph}
          <Text dimColor> {label}</Text>
        </Box>
      ))}
    </Box>
  );
}
