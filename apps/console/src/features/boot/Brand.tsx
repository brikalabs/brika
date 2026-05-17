/**
 * Static visual brand for the boot splash: the figlet logo and the
 * `BrikaOS · vX.Y.Z` tagline below it.
 *
 * Logo rows and their tint travel together as a tuple, so adding /
 * reordering rows never silently desyncs the colours.
 */

import { Box, Text } from 'ink';
import type React from 'react';

/** ANSI Shadow figlet for "BRIKA", paired with the colour each row
 *  should be rendered in. 6 rows × ~38 cells. */
const LOGO_ROWS: ReadonlyArray<readonly [line: string, color: string]> = [
  ['██████╗ ██████╗ ██╗██╗  ██╗ █████╗ ', 'cyan'],
  ['██╔══██╗██╔══██╗██║██║ ██╔╝██╔══██╗', 'cyan'],
  ['██████╔╝██████╔╝██║█████╔╝ ███████║', 'magenta'],
  ['██╔══██╗██╔══██╗██║██╔═██╗ ██╔══██║', 'magenta'],
  ['██████╔╝██║  ██║██║██║  ██╗██║  ██║', 'yellow'],
  ['╚═════╝ ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═╝', 'yellow'],
];

export function BrandLogo(): React.ReactElement {
  return (
    <Box flexDirection="column" alignItems="flex-start">
      {LOGO_ROWS.map(([line, color]) => (
        <Text key={line} color={color} bold>
          {line}
        </Text>
      ))}
    </Box>
  );
}

export function BrandTagline({ version }: Readonly<{ version: string }>): React.ReactElement {
  return (
    <Box marginTop={1}>
      <Text bold>BrikaOS </Text>
      <Text dimColor>· v{version}</Text>
    </Box>
  );
}
