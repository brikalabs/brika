/**
 * `<BrixHeader />` — the Brika startup card.
 *
 *   ╭────────────────────────────────────────────╮
 *   │ (◕◡◕) Brika Runtime v0.1.0                │
 *   │                                            │
 *   │ workspace: ~/projects/brika                │
 *   │ plugins: 12   workflows: 4   status: idle  │
 *   ╰────────────────────────────────────────────╯
 *
 * Pass `compact` to render a single-line variant:
 *
 *   (◕◡◕) Brika Runtime
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { Brix } from './Brix';
import type { Mood } from './moods';

export interface BrixHeaderProps {
  readonly version: string;
  readonly workspace?: string;
  readonly plugins?: number;
  readonly workflows?: number;
  readonly status?: string;
  readonly mood?: Mood;
  /** Render the single-line wordmark variant. */
  readonly compact?: boolean;
}

export function BrixHeader({
  version,
  workspace,
  plugins,
  workflows,
  status,
  mood = 'default',
  compact,
}: Readonly<BrixHeaderProps>): React.ReactElement {
  if (compact) {
    return (
      <Box>
        <Brix mood={mood} color="cyan" />
        <Text bold> Brika Runtime</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      <Box>
        <Brix mood={mood} color="cyan" />
        <Text bold> Brika Runtime </Text>
        <Text dimColor>v{version}</Text>
      </Box>
      {(workspace || plugins !== undefined || workflows !== undefined || status) && <Box />}
      {workspace && (
        <Box>
          <Text dimColor>workspace: </Text>
          <Text>{workspace}</Text>
        </Box>
      )}
      {(plugins !== undefined || workflows !== undefined || status) && (
        <Box>
          {plugins !== undefined && (
            <>
              <Text dimColor>plugins: </Text>
              <Text bold>{plugins}</Text>
              <Text>{'   '}</Text>
            </>
          )}
          {workflows !== undefined && (
            <>
              <Text dimColor>workflows: </Text>
              <Text bold>{workflows}</Text>
              <Text>{'   '}</Text>
            </>
          )}
          {status && (
            <>
              <Text dimColor>status: </Text>
              <Text>{status}</Text>
            </>
          )}
        </Box>
      )}
    </Box>
  );
}
