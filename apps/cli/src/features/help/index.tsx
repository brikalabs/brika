/**
 * Help section — keybind reference. Reached via `?` from any section.
 * The navigation column is derived from `NAV_SECTIONS` so it always
 * matches what `<NavBar>` renders.
 */

import { Kbd, useRouter } from '@brika/tui';
import { Box, Text, useInput } from 'ink';
import type React from 'react';
import type { Routes } from '../../routes';
import { NAV_SECTIONS } from '../../sections';
import { Section } from './Section';

export function HelpView(): React.ReactElement {
  const router = useRouter<Routes>();
  useInput((input, key) => {
    if (key.escape || input === '?') {
      router.back();
    }
  });

  const navItems: ReadonlyArray<readonly [React.ReactElement, string]> = [
    ...NAV_SECTIONS.map((s): readonly [React.ReactElement, string] => [
      <Kbd key={s.key}>{s.hotkey}</Kbd>,
      s.label,
    ]),
    [<Kbd key="prev">[</Kbd>, 'Previous tab'],
    [<Kbd key="next">]</Kbd>, 'Next tab'],
    [<Kbd key="help">?</Kbd>, 'Help'],
  ];

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Help</Text>
        <Text dimColor> ? or Esc to return</Text>
      </Box>

      <Box flexDirection="row" gap={6}>
        <Section title="Navigation" items={navItems} />
        <Section
          title="Hub control"
          items={[
            [<Kbd key="ka1">Ctrl+S</Kbd>, 'Start hub'],
            [<Kbd key="ka2">Ctrl+X</Kbd>, 'Stop hub'],
            [<Kbd key="ka3">Ctrl+R</Kbd>, 'Restart hub'],
            [<Kbd key="ka4">Ctrl+O</Kbd>, 'Open UI'],
          ]}
        />
        <Section
          title="Misc"
          items={[
            [<Kbd key="km1">q</Kbd>, 'Quit'],
            [<Kbd key="km2">Ctrl+C</Kbd>, 'Quit'],
          ]}
        />
      </Box>
    </Box>
  );
}
