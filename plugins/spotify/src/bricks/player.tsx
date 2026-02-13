import {
  defineBrick,
  useBrickSize,
  useEffect,
  useRef,
  useState,
} from '@brika/sdk/bricks/core';
import { Badge, Box, Button, Icon, Image, Spacer, Stack, Text } from '@brika/sdk/bricks/components';
import type { PlaybackState } from '../spotify-api';
import { spotify } from '../index';
import {
  acquirePolling,
  next,
  pause,
  play,
  previous,
  seek,
  setVolume,
  usePlayerStore,
} from '../playback-store';
import { Controls, type PlayerActions, ProgressBar, TrackInfo, VolumeSlider } from './components';

// ─── Layout: Small (1-2 cols) ───────────────────────────────────────────────

function SmallPlayer({ playback, width, actions }: Readonly<{
  playback: PlaybackState;
  width: number;
  actions: PlayerActions;
}>) {
  return (
    <Box backgroundImage={playback.albumArt ?? undefined} backgroundFit="cover" rounded="lg" grow>
      <Box background="rgba(0,0,0,0.3)" grow>
        <Stack direction="vertical" justify="center" align="center" gap="sm">
          <Spacer />
          {width >= 2
            ? <Controls isPlaying={playback.isPlaying} onPlay={actions.onPlay} onPause={actions.onPause} onPrev={actions.onPrev} onNext={actions.onNext} />
            : <Button onPress={playback.isPlaying ? actions.onPause : actions.onPlay} icon={playback.isPlaying ? 'pause' : 'play'} variant="ghost" />}
          <Spacer />
        </Stack>
      </Box>
    </Box>
  );
}

// ─── Layout: Medium (3-4 cols) ──────────────────────────────────────────────

function MediumPlayer({ playback, height, localProgressMs, actions }: Readonly<{
  playback: PlaybackState;
  height: number;
  localProgressMs: number;
  actions: PlayerActions;
}>) {
  const panel = (
    <Stack direction="vertical" gap="sm">
      <TrackInfo playback={playback} />
      <Controls isPlaying={playback.isPlaying} onPlay={actions.onPlay} onPause={actions.onPause} onPrev={actions.onPrev} onNext={actions.onNext} />
      <ProgressBar localProgressMs={localProgressMs} playback={playback} onSeek={actions.onSeek} />
      {height >= 4 && <VolumeSlider playback={playback} onVolume={actions.onVolume} />}
    </Stack>
  );

  return (
    <Box backgroundImage={playback.albumArt ?? undefined} backgroundFit="cover" rounded="lg" grow padding="sm">
      <Stack direction="vertical" grow justify={height >= 2 ? 'end' : 'start'}>
        <Box background="rgba(0,0,0,0.7)" blur="lg" padding="md" grow={height < 2} rounded={height < 2 ? 'lg' : 'md'}>
          {panel}
        </Box>
      </Stack>
    </Box>
  );
}

// ─── Layout: Large (5+ cols) ────────────────────────────────────────────────

function LargePlayer({ playback, height, localProgressMs, actions }: Readonly<{
  playback: PlaybackState;
  height: number;
  localProgressMs: number;
  actions: PlayerActions;
}>) {
  return (
    <Box backgroundImage={playback.albumArt ?? undefined} backgroundFit="cover" rounded="lg" blur="sm">
      <Box background="rgba(0,0,0,0.7)" blur="lg" padding="lg" rounded="lg" grow>
        <Stack direction="horizontal" gap="lg">
          {playback.albumArt == null
            ? <Box padding="none" />
            : <Image src={playback.albumArt} alt={playback.albumName} fit="cover" rounded aspectRatio="1/1" />}
          <Box grow padding="none">
            <Stack direction="vertical" gap="sm" justify="center">
              <TrackInfo playback={playback} />
              <Controls isPlaying={playback.isPlaying} onPlay={actions.onPlay} onPause={actions.onPause} onPrev={actions.onPrev} onNext={actions.onNext} />
              <ProgressBar localProgressMs={localProgressMs} playback={playback} onSeek={actions.onSeek} />
              {height >= 4 && <VolumeSlider playback={playback} onVolume={actions.onVolume} />}
              {height >= 5 && <Badge label={playback.deviceName} icon="speaker" variant="secondary" />}
            </Stack>
          </Box>
        </Stack>
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
    const { playback, isAuthed, loaded, anchor } = usePlayerStore();
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
      onPlay() { play(); },
      onPause() { pause(); },
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
          <Stack direction="vertical" gap="md" align="center" justify="center" grow>
            <Icon name="music" size="lg" color="#1DB954" />
            <Text content="Spotify" variant="heading" />
            <Spacer size="sm" />
            <Button label="Login with Spotify" url={spotify.getAuthUrl()} icon="log-in" color="#1DB954" />
          </Stack>
        </Box>
      );
    }

    if (!playback) {
      return (
        <Box background="rgba(0,0,0,0.3)" blur="sm" padding="md" rounded="lg">
          <Stack direction="vertical" gap="sm" align="center" justify="center" grow>
            <Icon name="music" size="md" color="#1DB954" />
            <Text content={loaded ? 'No playback' : 'Connecting…'} variant="caption" />
          </Stack>
        </Box>
      );
    }

    if (width <= 2) return <SmallPlayer playback={playback} width={width} actions={actions} />;
    if (width <= 4) return <MediumPlayer playback={playback} height={height} localProgressMs={localProgressMs} actions={actions} />;
    return <LargePlayer playback={playback} height={height} localProgressMs={localProgressMs} actions={actions} />;
  },
);
