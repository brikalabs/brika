import { Badge, Spinner } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import type { UpdateInfoDto } from '../../shared/cli/api/updates';

export function LatestVersion({
  info,
  checking,
}: Readonly<{ info: UpdateInfoDto | null; checking: boolean }>): React.ReactElement {
  if (checking && !info) {
    return (
      <Box>
        <Spinner color="cyan" />
        <Text dimColor> checking…</Text>
      </Box>
    );
  }
  if (!info) {
    return <Text dimColor>—</Text>;
  }
  if (info.updateAvailable) {
    return (
      <Box>
        <Text color="green" bold>
          v{info.latestVersion}
        </Text>
        <Text> </Text>
        <Badge variant="success" dot>
          update available
        </Badge>
      </Box>
    );
  }
  if (info.devBuild) {
    return (
      <Box>
        <Text>v{info.latestVersion}</Text>
        <Text> </Text>
        <Badge variant="info">dev build</Badge>
      </Box>
    );
  }
  return (
    <Box>
      <Text>v{info.latestVersion}</Text>
      <Text> </Text>
      <Badge variant="secondary">up to date</Badge>
    </Box>
  );
}
