import { homedir } from 'node:os';
import { Badge, Kbd, StatTile } from '@brika/tui';
import { Text } from 'ink';
import type React from 'react';
import { useCli } from '../../shared/hooks/useCli';

export function HubTile({ fill }: Readonly<{ fill: boolean }>): React.ReactElement {
  const cli = useCli();
  const hub = cli.hub;
  if (hub.state === 'running') {
    return (
      <StatTile
        icon="●"
        title="Hub"
        accent="success"
        fill={fill}
        status={
          <Badge variant="success" dot>
            running
          </Badge>
        }
        footer={
          <Text dimColor>
            <Kbd>^X</Kbd> stop · <Kbd>^R</Kbd> restart · <Kbd>^O</Kbd> open
          </Text>
        }
      >
        <Text>{hub.pid === null ? 'external process' : `pid ${hub.pid}`}</Text>
        <Text dimColor wrap="truncate-middle">
          {shortenPath(cli.workspace)}
        </Text>
      </StatTile>
    );
  }
  if (hub.state === 'stale') {
    return (
      <StatTile
        icon="●"
        title="Hub"
        accent="warning"
        fill={fill}
        status={
          <Badge variant="warning" dot>
            stale
          </Badge>
        }
      >
        <Text>{`pid ${hub.pid}`}</Text>
        <Text dimColor>not actually running</Text>
      </StatTile>
    );
  }
  if (hub.state === 'stopped') {
    return (
      <StatTile
        icon="◌"
        title="Hub"
        fill={fill}
        status={
          <Badge variant="secondary" dot>
            stopped
          </Badge>
        }
        footer={
          <Text dimColor>
            <Kbd>^S</Kbd> to start
          </Text>
        }
      >
        <Text dimColor>nothing watching</Text>
      </StatTile>
    );
  }
  return (
    <StatTile icon="·" title="Hub" fill={fill}>
      <Text dimColor>checking…</Text>
    </StatTile>
  );
}

/** Replace the leading `$HOME` with `~` so workspace paths read more
 *  naturally inside narrow tiles. Anything outside home is returned
 *  unchanged. */
function shortenPath(path: string): string {
  const home = homedir();
  if (home && path.startsWith(home)) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}
