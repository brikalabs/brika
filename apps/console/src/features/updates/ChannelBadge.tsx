import { Badge } from '@brika/tui';
import { Text } from 'ink';
import type React from 'react';
import type { UpdateChannelId } from '../../shared/cli/api/updates';

export function ChannelBadge({
  channel,
}: Readonly<{ channel: UpdateChannelId | null }>): React.ReactElement {
  if (channel === null) {
    return <Text dimColor>—</Text>;
  }
  if (channel === 'canary') {
    return <Badge variant="warning">canary</Badge>;
  }
  return <Badge variant="info">stable</Badge>;
}
