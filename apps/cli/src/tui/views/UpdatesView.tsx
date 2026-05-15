/**
 * Updates section — check for updates, switch channels, apply.
 * Stubbed for this PR; needs the update-channels module + checker.
 *
 * Brix lives in the shell footer (<BrixHost>) — this view doesn't
 * render its own face. It publishes mood/statusText through
 * <CliProvider> if it needs to say something.
 */

import { Heading, Hint, HintBar, Properties, Property } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { useCli } from '../useCli';

export function UpdatesView(): React.ReactElement {
  const cli = useCli();
  return (
    <Box flexDirection="column">
      <Heading>Updates</Heading>
      <Properties>
        <Property name="current">{`v${cli.version}`}</Property>
        <Property name="channel">stable</Property>
      </Properties>
      <Box marginTop={1}>
        <Text dimColor>
          update check + channel switching land once the channels module is portable
        </Text>
      </Box>
      <HintBar>
        <Hint k="c" accent="info">
          check
        </Hint>
        <Hint k="n">switch channel</Hint>
        <Hint k="Enter" accent="success">
          apply
        </Hint>
      </HintBar>
    </Box>
  );
}
