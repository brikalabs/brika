import { Box, Text } from 'ink';
import type React from 'react';

export const LABEL_WIDTH = 10;

export interface InfoLineProps {
  readonly label: string;
  readonly color: string;
  readonly children: React.ReactNode;
}

export function InfoLine({ label, color, children }: Readonly<InfoLineProps>): React.ReactElement {
  return (
    <Box>
      <Box width={LABEL_WIDTH}>
        <Text color={color} dimColor>
          {label}
        </Text>
      </Box>
      <Box>{children}</Box>
    </Box>
  );
}
