/**
 * Final-row content under the step list. Flips between the copyright
 * line (while booting) and a brief "ready" celebration (once every
 * step has resolved). Same row height in both states so the layout
 * doesn't jump on transition.
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { copyrightLine } from './copyright';
import type { BootPhase } from './useBootSequence';

export function ReadyLine({ phase }: Readonly<{ phase: BootPhase }>): React.ReactElement {
  if (phase === 'ready') {
    return (
      <Box marginTop={1}>
        <Text color="green" bold>
          ✓ ready
        </Text>
      </Box>
    );
  }
  return (
    <Box marginTop={1}>
      <Text dimColor>{copyrightLine()}</Text>
    </Box>
  );
}
