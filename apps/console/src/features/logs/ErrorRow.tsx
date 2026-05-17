import { Box, Text } from 'ink';
import type React from 'react';

export function ErrorRow({
  message,
}: Readonly<{ message: string | null }>): React.ReactElement | null {
  if (!message) {
    return null;
  }
  return (
    <Box flexShrink={0}>
      <Text color="red">✗ {message}</Text>
    </Box>
  );
}
