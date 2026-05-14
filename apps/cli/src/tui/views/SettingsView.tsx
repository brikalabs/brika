/**
 * Settings section — read-only view of the Brika environment + paths
 * the CLI cares about. Writable settings (default channel, port,
 * default host) land once we have a place to persist them.
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { useCli } from '../useCli';

export function SettingsView(): React.ReactElement {
  const cli = useCli();
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Settings</Text>
      </Box>
      <Row label="BRIKA_HOME" value={cli.workspace} />
      <Row label="version" value={`v${cli.version}`} />
      <Row label="hub host" value={process.env.BRIKA_HOST || '127.0.0.1'} />
      <Row label="hub port" value={process.env.BRIKA_PORT || '3001'} />
      <Row label="runtime" value={`Bun ${Bun.version}`} />
      <Row label="platform" value={`${process.platform}/${process.arch}`} />
      <Box marginTop={1}>
        <Text dimColor>read-only for now · edit env vars on the host shell</Text>
      </Box>
    </Box>
  );
}

function Row({ label, value }: Readonly<{ label: string; value: string }>): React.ReactElement {
  return (
    <Box>
      <Box width={14}>
        <Text dimColor>{label}</Text>
      </Box>
      <Text>{value}</Text>
    </Box>
  );
}
