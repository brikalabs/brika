import { Spinner } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import type { UpdateProgress } from '../../shared/cli/api/updates';

export function ProgressLine({
  progress,
}: Readonly<{ progress: UpdateProgress }>): React.ReactElement {
  return (
    <Box>
      <ProgressGlyph progress={progress} />
      <Text bold>{progress.phase}</Text>
      {progress.message ? <Text dimColor>{` — ${progress.message}`}</Text> : null}
    </Box>
  );
}

function ProgressGlyph({
  progress,
}: Readonly<{ progress: UpdateProgress }>): React.ReactElement {
  if (progress.phase === 'error') {
    return <Text color="red">✗ </Text>;
  }
  if (progress.phase === 'restarting' || progress.phase === 'complete') {
    return <Text color="green">✓ </Text>;
  }
  return (
    <>
      <Spinner color="yellow" />
      <Text> </Text>
    </>
  );
}
