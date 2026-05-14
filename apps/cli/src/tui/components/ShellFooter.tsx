/**
 * Bottom strip — the one Brix in the chrome (<BrixHost>) on the
 * left, condensed keybinds on the right. Views publish their mood +
 * status line via <CliProvider>; BrixHost is the only mascot in the
 * shell, so no other view is allowed to paint its own face here.
 */

import { Kbd } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { BrixHost } from './BrixHost';

export function ShellFooter(): React.ReactElement {
  return (
    <Box flexDirection="column" paddingX={1} marginTop={1}>
      <BrixHost />
      <Box marginTop={0}>
        <Kbd>^S</Kbd>
        <Text dimColor> start </Text>
        <Kbd>^X</Kbd>
        <Text dimColor> stop </Text>
        <Kbd>^R</Kbd>
        <Text dimColor> restart </Text>
        <Kbd>^O</Kbd>
        <Text dimColor> open </Text>
        <Kbd>?</Kbd>
        <Text dimColor> help </Text>
        <Kbd>q</Kbd>
        <Text dimColor> quit</Text>
      </Box>
    </Box>
  );
}
