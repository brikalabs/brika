/**
 * Default HMR error overlay. Renders nothing when the store is
 * empty; pops a red-bordered Ink Box when a reload fails. Drop it
 * at the end of your App tree, or rely on `runTui`'s auto-mount
 * via `globalThis.__brikaHmrOverlay`.
 */

import { Box, Text } from 'ink';
import type { ReactElement } from 'react';
import { useHmrError } from './error-store';

export function HmrErrorOverlay(): ReactElement | null {
  const err = useHmrError();
  if (!err) {
    return null;
  }
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={1}>
      <Text bold color="red">
        HMR error
      </Text>
      <Text dimColor>{err.file}</Text>
      <Box marginTop={1}>
        <Text color="red">{err.message}</Text>
      </Box>
      {err.stack && (
        <Box marginTop={1}>
          <Text dimColor>{err.stack}</Text>
        </Box>
      )}
    </Box>
  );
}
