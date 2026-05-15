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

import { Badge, Button, Heading, Properties, Property, Spinner, useKey } from '@brika/tui';
import { Box, Text } from 'ink';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  applyUpdate,
  fetchUpdateChannel,
  fetchUpdateInfo,
  setUpdateChannel,
  type UpdateChannelId,
  type UpdateInfoDto,
  type UpdateProgress,
} from '../../cli/hub-api';
import { Markdown } from '../components/Markdown';
import { NotConnected } from '../components/NotConnected';
import { useCli } from '../useCli';

const CHANNELS: ReadonlyArray<UpdateChannelId> = ['stable', 'canary'];

export function UpdatesView(): React.ReactElement {
  const cli = useCli();
  const [info, setInfo] = useState<UpdateInfoDto | null>(null);
  const [channel, setChannel] = useState<UpdateChannelId | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [applying, setApplying] = useState(false);

  const connected = cli.hub.state === 'running';

  const check = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const [next, ch] = await Promise.all([fetchUpdateInfo(), fetchUpdateChannel()]);
      setInfo(next);
      setChannel(ch);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  }, []);

  // Initial load when the hub is reachable.
  useEffect(() => {
    if (!connected) {
      return;
    }
    void check();
  }, [connected, check]);

  const cycleChannel = useCallback(async () => {
    if (channel === null) {
      return;
    }
    const idx = CHANNELS.indexOf(channel);
    const next = CHANNELS[(idx + 1) % CHANNELS.length] ?? CHANNELS[0];
    if (!next) {
      return;
    }
    setError(null);
    try {
      await setUpdateChannel(next);
      setChannel(next);
      // Re-check against the new channel so latestVersion reflects it.
      void check();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [channel, check]);

  const startApply = useCallback(async () => {
    if (applying) {
      return;
    }
    setApplying(true);
    setProgress({ phase: 'checking', message: 'starting…' });
    setError(null);
    try {
      for await (const event of applyUpdate()) {
        setProgress(event);
        if (event.phase === 'error') {
          setError(event.error ?? event.message ?? 'update failed');
          break;
        }
        if (event.phase === 'restarting' || event.phase === 'complete') {
          break;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }, [applying]);

  useKey('c', () => void check(), connected && !applying);
  useKey('n', () => void cycleChannel(), connected && !applying && channel !== null);
  useKey(
    'return',
    () => void startApply(),
    connected && !applying && (info?.updateAvailable ?? false)
  );

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
        <Button shortcut="c" enabled={!applying} onPress={() => void check()}>
          check
        </Button>
        <Button
          shortcut="n"
          enabled={!applying && channel !== null}
          onPress={() => void cycleChannel()}
        >
          channel
        </Button>
        <Button
          shortcut="Enter"
          variant="success"
          enabled={!applying && (info?.updateAvailable ?? false)}
          onPress={() => void startApply()}
        >
          apply
        </Button>
      </Box>
    </Box>
  );
}

function subtitleFor(info: UpdateInfoDto | null): string {
  if (!info) {
    return 'loading…';
  }
  if (info.devBuild) {
    return 'dev build · ahead of latest release';
  }
  if (info.updateAvailable) {
    return `v${info.latestVersion} is available`;
  }
  return 'up to date';
}

function LatestVersion({
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

function ChannelBadge({
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

function ProgressLine({ progress }: Readonly<{ progress: UpdateProgress }>): React.ReactElement {
  return (
    <Box>
      <ProgressGlyph progress={progress} />
      <Text bold>{progress.phase}</Text>
      {progress.message ? <Text dimColor>{` — ${progress.message}`}</Text> : null}
    </Box>
  );
}

function ProgressGlyph({ progress }: Readonly<{ progress: UpdateProgress }>): React.ReactElement {
  if (progress.phase === 'error') {
    return <Text color="red">✗ </Text>;
  }
  if (progress.phase === 'restarting' || progress.phase === 'complete') {
    return <Text color="green">✓ </Text>;
  }
  return (
    <>
      <Spinner color="yellow" />
      <Text> </Text>
    </>
  );
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    return iso;
  }
  const diffMs = Date.now() - t;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) {
    return `${sec}s ago`;
  }
  const min = Math.round(sec / 60);
  if (min < 60) {
    return `${min}m ago`;
  }
  const hr = Math.round(min / 60);
  if (hr < 24) {
    return `${hr}h ago`;
  }
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
