/**
 * Help section — keybind reference. Reached via `?` from any section.
 */

import { Kbd, useRouter } from '@brika/tui';
import { Box, Text, useInput } from 'ink';
import type React from 'react';
import type { Routes } from '../routes';

export function HelpView(): React.ReactElement {
  const router = useRouter<Routes>();
  useInput((input, key) => {
    if (key.escape || input === '?') {
      router.back();
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Help</Text>
        <Text dimColor> ? or Esc to return</Text>
      </Box>

      <Box flexDirection="row" gap={6}>
        <Section
          title="Navigation"
          items={[
            [<Kbd key="k1">d</Kbd>, 'Dashboard'],
            [<Kbd key="k2">p</Kbd>, 'Plugins'],
            [<Kbd key="k3">w</Kbd>, 'Workflows'],
            [<Kbd key="k4">l</Kbd>, 'Logs'],
            [<Kbd key="k5">u</Kbd>, 'Users'],
            [<Kbd key="k6">g</Kbd>, 'Updates'],
            [<Kbd key="k7">,</Kbd>, 'Settings'],
            [<Kbd key="k8">?</Kbd>, 'Help'],
          ]}
        />
        <Section
          title="Hub control"
          items={[
            [<Kbd key="ka1">s</Kbd>, 'Start hub'],
            [<Kbd key="ka2">x</Kbd>, 'Stop hub'],
            [<Kbd key="ka3">r</Kbd>, 'Restart hub'],
            [<Kbd key="ka4">o</Kbd>, 'Open UI'],
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

interface SectionProps {
  readonly title: string;
  readonly items: ReadonlyArray<readonly [React.ReactElement, string]>;
}

function Section({ title, items }: Readonly<SectionProps>): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold dimColor>
          {title.toUpperCase()}
        </Text>
      </Box>
      {items.map(([glyph, label], i) => (
        <Box key={`${title}-${i}`}>
          {glyph}
          <Text dimColor> {label}</Text>
        </Box>
      ))}
    </Box>
  );
}
