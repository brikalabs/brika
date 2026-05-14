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
        <Kbd>tab</Kbd>
        <Text dimColor> section </Text>
        <Kbd>s</Kbd>
        <Text dimColor> start </Text>
        <Kbd>x</Kbd>
        <Text dimColor> stop </Text>
        <Kbd>r</Kbd>
        <Text dimColor> restart </Text>
        <Kbd>o</Kbd>
        <Text dimColor> open </Text>
        <Kbd>?</Kbd>
        <Text dimColor> help </Text>
        <Kbd>q</Kbd>
        <Text dimColor> quit</Text>
      </Box>
    </Box>
  );
}
