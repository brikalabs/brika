import { Badge, Box, Button, Column, defineBrick, Icon, Image, Row, Spacer, Text, useBrickSize, useEffect, usePluginPreference, usePreference, useRef, useState } from '@brika/sdk/bricks';
import { spotify } from '../index';
import {
  acquirePolling,
  next,
  pause,
  play,
  previous,
  seek,
  setVolume,
  startPlayback,
  usePlayerStore,
} from '../playback-store';
import type { PlaybackState } from '../spotify-api';
import { Controls, type PlayerActions, ProgressBar, TrackInfo, VolumeSlider } from './components';

// ─── Common layout props ─────────────────────────────────────────────────────

interface TrackDisplay {
  trackName: string;
  artistName: string;
  albumArt: string | null;
}

interface LayoutProps {
  track: TrackDisplay;
  playback: PlaybackState | null;
  actions: PlayerActions;
}

// ─── Layout: Small (1-2 cols) ───────────────────────────────────────────────

function SmallPlayer({ track, playback, width, actions }: Readonly<LayoutProps & { width: number }>) {
  const isPlaying = playback?.isPlaying ?? false;
  return (
    <Box backgroundImage={track.albumArt ?? undefined} backgroundFit="cover" rounded="lg" grow>
      <Box background="rgba(0,0,0,0.3)" grow>
        <Column justify="center" align="center" gap="sm">
          <Spacer />
          {width >= 2
            ? <Controls isPlaying={isPlaying} onPlay={actions.onPlay} onPause={actions.onPause} onPrev={actions.onPrev} onNext={actions.onNext} />
            : <Button onPress={isPlaying ? actions.onPause : actions.onPlay} icon={isPlaying ? 'pause' : 'play'} color="rgba(0,0,0,0.4)" />}
          <Spacer />
        </Column>
      </Box>
    </Box>
  );
}

// ─── Layout: Medium (3-4 cols) ──────────────────────────────────────────────

function MediumPlayer({ track, playback, height, localProgressMs, actions }: Readonly<LayoutProps & { height: number; localProgressMs: number }>) {
  const isPlaying = playback?.isPlaying ?? false;
  return (
    <Box backgroundImage={track.albumArt ?? undefined} backgroundFit="cover" rounded="lg" grow padding="sm">
      <Column grow justify={height >= 2 ? 'end' : 'start'}>
        <Box background="rgba(0,0,0,0.7)" blur="lg" padding="md" grow={height < 2} rounded={height < 2 ? 'lg' : 'md'}>
          <Column gap="sm">
            <TrackInfo trackName={track.trackName} artistName={track.artistName} />
            <Controls isPlaying={isPlaying} onPlay={actions.onPlay} onPause={actions.onPause} onPrev={actions.onPrev} onNext={actions.onNext} />
            {playback && <ProgressBar localProgressMs={localProgressMs} durationMs={playback.durationMs} onSeek={actions.onSeek} />}
            {playback && height >= 4 && <VolumeSlider volume={playback.volume} onVolume={actions.onVolume} />}
          </Column>
        </Box>
      </Column>
    </Box>
  );
}

// ─── Layout: Large (5+ cols) ────────────────────────────────────────────────

function LargePlayer({ track, playback, height, localProgressMs, actions }: Readonly<LayoutProps & { height: number; localProgressMs: number }>) {
  const isPlaying = playback?.isPlaying ?? false;
  return (
    <Box backgroundImage={track.albumArt ?? undefined} backgroundFit="cover" rounded="lg" blur="sm">
      <Box background="rgba(0,0,0,0.7)" blur="lg" padding="lg" rounded="lg" grow>
        <Row gap="lg">
          {track.albumArt == null
            ? <Box padding="none" />
            : <Image src={track.albumArt} alt={playback?.albumName ?? track.trackName} fit="cover" rounded aspectRatio="1/1" />}
          <Box grow padding="none">
            <Column gap="sm" justify="center">
              <TrackInfo trackName={track.trackName} artistName={track.artistName} />
              <Controls isPlaying={isPlaying} onPlay={actions.onPlay} onPause={actions.onPause} onPrev={actions.onPrev} onNext={actions.onNext} />
              {playback && <ProgressBar localProgressMs={localProgressMs} durationMs={playback.durationMs} onSeek={actions.onSeek} />}
              {playback && height >= 4 && <VolumeSlider volume={playback.volume} onVolume={actions.onVolume} />}
              {playback && height >= 5 && <Badge label={playback.deviceName} icon="speaker" variant="secondary" color="rgba(255,255,255,0.6)" />}
            </Column>
          </Box>
        </Row>
      </Box>
    </Box>
  );
}

// ─── Brick ──────────────────────────────────────────────────────────────────

export const playerBrick = defineBrick(
  {
    id: 'player',
    families: ['sm', 'md', 'lg'],
    minSize: { w: 1, h: 1 },
    maxSize: { w: 12, h: 8 },
  },
  () => {
    const { width, height } = useBrickSize();
    const { playback, recentTrack, devices, isAuthed, anchor } = usePlayerStore();
    const [instanceDeviceId] = usePreference<string>('device', '');
    const pluginDeviceId = usePluginPreference<string>('defaultDevice', '');
    const preferredId = instanceDeviceId || pluginDeviceId || undefined;
    const targetId = preferredId ?? devices[0]?.id;
    const [localProgressMs, setLocalProgressMs] = useState(anchor.progressMs);
    const anchorRef = useRef(anchor);

    // Start/stop shared polling
    useEffect(() => acquirePolling(), []);

    // Keep anchor ref in sync and snap localProgressMs immediately
    useEffect(() => {
      anchorRef.current = anchor;
      setLocalProgressMs(anchor.progressMs);
    }, [anchor]);

    // ─── Local progress interpolation (1s tick) ─────────────────────────

    useEffect(() => {
      if (!playback?.isPlaying) return;
      const id = setInterval(() => {
        const elapsed = Date.now() - anchorRef.current.timestamp;
        const interpolated = Math.min(
          anchorRef.current.progressMs + elapsed,
          playback.durationMs,
        );
        setLocalProgressMs(interpolated);
      }, 1000);
      return () => clearInterval(id);
    }, [playback?.isPlaying, playback?.durationMs]);

    // ─── Actions ────────────────────────────────────────────────────────

    const actions: PlayerActions = {
      onPlay() {
        if (playback) play(targetId);
        else startPlayback(targetId);
      },
      onPause() { pause(targetId); },
      onNext() { next(); },
      onPrev() { previous(); },
      onSeek(payload) {
        if (typeof payload?.value === 'number' && playback) {
          const positionMs = Math.round((payload.value / 100) * playback.durationMs);
          seek(positionMs);
          setLocalProgressMs(positionMs);
        }
      },
      onVolume(payload) {
        if (typeof payload?.value === 'number') setVolume(payload.value);
      },
    };

    // ─── Render ─────────────────────────────────────────────────────────

    if (!isAuthed) {
      return (
        <Box background="rgba(0,0,0,0.4)" blur="md" padding="lg" rounded="lg">
          <Column gap="md" align="center" justify="center" grow>
            <Icon name="music" size="lg" color="#1DB954" />
            <Text content="Spotify" variant="heading" color="rgba(255,255,255,0.95)" />
            <Spacer size="sm" />
            <Button label="Login with Spotify" url={spotify.getAuthUrl()} icon="log-in" color="#1DB954" />
          </Column>
        </Box>
      );
    }

    const track = playback ?? recentTrack;

    if (!track) {
      return (
        <Box background="rgba(0,0,0,0.3)" blur="sm" padding="md" rounded="lg">
          <Column align="center" justify="center" grow>
            <Button icon="play" color="#1DB954" onPress={actions.onPlay} />
          </Column>
        </Box>
      );
    }

    const layoutProps = { track, playback, actions };

    if (width <= 2) return <SmallPlayer {...layoutProps} width={width} />;
    if (width <= 4) return <MediumPlayer {...layoutProps} height={height} localProgressMs={localProgressMs} />;
    return <LargePlayer {...layoutProps} height={height} localProgressMs={localProgressMs} />;
  },
);
