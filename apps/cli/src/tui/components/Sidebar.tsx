/**
 * Left-rail navigation for the brika TUI. Lists every section in
 * `SIDEBAR_SECTIONS`, highlights the active route, and surfaces each
 * section's hotkey so users learn the shortcut just by glancing at
 * the list.
 */

import { useRouter } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { type Routes, SIDEBAR_SECTIONS } from '../routes';

export function Sidebar(): React.ReactElement {
  const router = useRouter<Routes>();
  return (
    <Box flexDirection="column" paddingX={1} paddingY={0} minWidth={18}>
      <Box marginBottom={1}>
        <Text bold dimColor>
          BRIKA
        </Text>
      </Box>
      {SIDEBAR_SECTIONS.map((section) => {
        const active = router.current.name === section.key;
        return (
          <Box key={section.key}>
            <Text color={active ? 'cyan' : 'gray'}>{active ? '▸ ' : '  '}</Text>
            <Text color={active ? 'cyan' : undefined} bold={active}>
              {section.label}
            </Text>
            <Text dimColor>{`  ${section.hotkey}`}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
