/**
 * Updates section — check, switch channels, apply.
 *
 *   ╭─ ▲ Updates ─────── update available ─╮
 *   │ current  v0.1.0                       │
 *   │ latest   v0.1.2                       │
 *   │ channel  stable                       │
 *   │                                       │
 *   │ # release notes                       │
 *   │ - fixed plugin reload races           │
 *   │ - bumped bun to 1.3.13                │
 *   │                                       │
 *   │ [c] check  [n] channel  [Enter] apply │
 *   ╰───────────────────────────────────────╯
 *
 * Backed by:
 *   - `GET    /api/system/update`            – check for updates
 *   - `GET    /api/settings/update-channel`  – read channel
 *   - `PUT    /api/settings/update-channel`  – set channel
 *   - `POST   /api/system/update/apply`      – SSE-streamed install
 *
 * Brix lives in `<BrixHeader>` — this view talks to the user via its
 * own status line near the buttons.
 */

import { Button, Heading, Properties, Property } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { Markdown } from '../../shared/components/Markdown';
import { NotConnected } from '../../shared/components/NotConnected';
import { useCli } from '../../shared/hooks/useCli';
import { ChannelBadge } from './ChannelBadge';
import { LatestVersion } from './LatestVersion';
import { ProgressLine } from './ProgressLine';
import { useUpdates } from './useUpdates';
import { formatRelative, subtitleFor } from './utils';

export function UpdatesView(): React.ReactElement {
  const cli = useCli();
  const { info, channel, checking, applying, progress, error, check, cycleChannel, startApply } =
    useUpdates();

  const connected = cli.hub.state === 'running';

  // No standalone `useKey` here — every action below is a `<Button>`,
  // and Button wires its own shortcut, click, and Tab+Enter handlers.

  if (!connected) {
    return <NotConnected title="Updates" />;
  }

  return (
    <Box flexDirection="column">
      <Heading subtitle={subtitleFor(info)} meta={error ? <Text color="red">{error}</Text> : null}>
        Updates
      </Heading>

      <Properties>
        <Property name="current">
          <Text>v{info?.currentVersion ?? cli.version}</Text>
          {info?.devBuild ? <Text dimColor> · dev build</Text> : null}
        </Property>
        <Property name="latest">
          <LatestVersion info={info} checking={checking} />
        </Property>
        <Property name="channel">
          <ChannelBadge channel={channel} />
        </Property>
        {info?.lastCheckedAt ? (
          <Property name="checked">
            <Text dimColor>{formatRelative(info.lastCheckedAt)}</Text>
          </Property>
        ) : null}
      </Properties>

      {info?.releaseNotes ? (
        <Box marginTop={1} flexDirection="column">
          <Text bold dimColor>
            RELEASE NOTES
          </Text>
          <Markdown source={info.releaseNotes} />
        </Box>
      ) : null}

      {progress ? (
        <Box marginTop={1}>
          <ProgressLine progress={progress} />
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Button shortcut="c" autoFocus enabled={!applying} onPress={check}>
          check
        </Button>
        <Button shortcut="n" enabled={!applying && channel !== null} onPress={cycleChannel}>
          channel
        </Button>
        <Button
          shortcut="enter"
          variant="success"
          enabled={!applying && (info?.updateAvailable ?? false)}
          onPress={startApply}
        >
          apply
        </Button>
      </Box>
    </Box>
  );
}
