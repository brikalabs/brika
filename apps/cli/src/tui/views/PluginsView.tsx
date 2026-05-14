/**
 * Plugins section — list, enable/disable, install/uninstall, read
 * each plugin's README inline. Stubbed for this PR; needs HTTP
 * endpoints on the hub (#9 in docs/cli-tui/tasks.md).
 */

import { BrixSay } from '@brika/brix';
import { Box, Text } from 'ink';
import type React from 'react';
import { useCli } from '../useCli';

export function PluginsView(): React.ReactElement {
  const cli = useCli();
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Plugins </Text>
        <Text dimColor>{cli.plugins.length}</Text>
      </Box>
      {cli.plugins.length === 0 ? (
        <BrixSay
          mood="curious"
          orient="above"
          text="no plugins discovered yet — install one from the registry once the hub exposes /api/plugins"
        />
      ) : (
        <Box flexDirection="column">
          {cli.plugins.map((p) => (
            <Box key={p.name}>
              <Text>{p.enabled ? '▸' : '·'} </Text>
              <Text>{p.name}</Text>
              <Text dimColor> v{p.version}</Text>
            </Box>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>i install · d disable · e enable · u uninstall · enter readme</Text>
      </Box>
    </Box>
  );
}
