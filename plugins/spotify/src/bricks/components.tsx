/**
 * Shared sub-components for the Spotify player brick.
 * Each renders a reusable piece of the player UI.
 */

import { Box, Button, Slider, Stack, Text } from '@brika/sdk/bricks/components';
import type { PlaybackState } from '../spotify-api';
import { formatMs, progressPercent } from './utils';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PlayerActions {
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (payload?: Record<string, unknown>) => void;
  onVolume: (payload?: Record<string, unknown>) => void;
}

// ─── Transport Controls ─────────────────────────────────────────────────────

export function Controls({ isPlaying, onPlay, onPause, onPrev, onNext }: {
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <Stack direction="horizontal" gap="sm" justify="center" align="center">
      <Button onPress={onPrev} icon="skip-back" variant="ghost" />
      {isPlaying
        ? <Button onPress={onPause} icon="pause" />
        : <Button onPress={onPlay} icon="play" />}
      <Button onPress={onNext} icon="skip-forward" variant="ghost" />
    </Stack>
  );
}

// ─── Track Info ─────────────────────────────────────────────────────────────

export function TrackInfo({ playback }: { playback: PlaybackState }) {
  return (
    <Stack direction="horizontal" gap="sm" align="center">
      <Text content={playback.trackName} variant="heading" />
      <Text content={playback.artistName} variant="caption" color="#888" />
    </Stack>
  );
}

// ─── Progress Bar ───────────────────────────────────────────────────────────

export function ProgressBar({ localProgressMs, playback, onSeek }: {
  localProgressMs: number;
  playback: PlaybackState;
  onSeek: (payload?: Record<string, unknown>) => void;
}) {
  return (
    <Stack direction="horizontal" gap="sm" align="center">
      <Text content={formatMs(localProgressMs)} variant="caption" color="#888" />
      <Box grow>
        <Slider value={progressPercent(localProgressMs, playback.durationMs)} min={0} max={100} step={1} onChange={onSeek} color="#1DB954" />
      </Box>
      <Text content={formatMs(playback.durationMs)} variant="caption" color="#888" />
    </Stack>
  );
}

// ─── Volume Slider ──────────────────────────────────────────────────────────

export function VolumeSlider({ playback, onVolume }: {
  playback: PlaybackState;
  onVolume: (payload?: Record<string, unknown>) => void;
}) {
  return (
    <Slider label="Volume" value={playback.volume} min={0} max={100} step={5} unit="%" onChange={onVolume} icon="volume-2" />
  );
}
