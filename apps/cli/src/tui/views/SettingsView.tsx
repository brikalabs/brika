/**
 * Settings section — read-only view of the Brika environment + paths
 * the CLI cares about. Writable settings (default channel, port,
 * default host) land once we have a place to persist them.
 */

import { Heading, Properties, Property } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { useCli } from '../useCli';

export function SettingsView(): React.ReactElement {
  const cli = useCli();
  return (
    <Box flexDirection="column">
      <Heading>Settings</Heading>
      <Properties>
        <Property name="BRIKA_HOME">{cli.workspace}</Property>
        <Property name="version">{`v${cli.version}`}</Property>
        <Property name="hub host">{process.env.BRIKA_HOST || '127.0.0.1'}</Property>
        <Property name="hub port">{process.env.BRIKA_PORT || '3001'}</Property>
        <Property name="runtime">{`Bun ${Bun.version}`}</Property>
        <Property name="platform">{`${process.platform}/${process.arch}`}</Property>
      </Properties>
      <Box marginTop={1}>
        <Text dimColor>read-only for now · edit env vars on the host shell</Text>
      </Box>
    </Box>
  );
}
