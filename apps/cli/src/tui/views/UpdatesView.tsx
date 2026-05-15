/**
 * Updates section — check for updates, switch channels, apply.
 * Stubbed for this PR; needs the update-channels module + checker.
 *
 * Brix lives in the shell footer (<BrixHost>) — this view doesn't
 * render its own face. It publishes mood/statusText through
 * <CliProvider> if it needs to say something.
 */

import { Properties, Property } from '@brika/tui';
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
      <Properties>
        <Property name="current">{`v${cli.version}`}</Property>
        <Property name="channel">stable</Property>
      </Properties>
      <Box marginTop={1}>
        <Text dimColor>
          update check + channel switching land once the channels module is portable
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>c check · n switch channel · enter apply</Text>
      </Box>
    </Box>
  );
}
