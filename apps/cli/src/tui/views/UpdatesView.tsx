/**
 * Updates section — check for updates, switch channels, apply.
 * Stubbed for this PR; needs the update-channels module + checker.
 */

import { BrixSay } from '@brika/brix';
import { Box, Text } from 'ink';
import type React from 'react';
import { useCli } from '../useCli';

export function UpdatesView(): React.ReactElement {
  const cli = useCli();
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Updates</Text>
      </Box>
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text dimColor>current: </Text>
          <Text>v{cli.version}</Text>
        </Box>
        <Box>
          <Text dimColor>channel: </Text>
          <Text>stable</Text>
        </Box>
      </Box>
      <BrixSay
        mood="curious"
        orient="above"
        text="update check + channel switching land once the channels module is portable"
      />
      <Box marginTop={1}>
        <Text dimColor>c check · n switch channel · enter apply</Text>
      </Box>
    </Box>
  );
}
