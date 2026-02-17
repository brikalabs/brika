/**
 * Shared sub-components for the Spotify player brick.
 * Each renders a reusable piece of the player UI.
 */

import { Box, Button, Row, Slider, Text } from '@brika/sdk/bricks';
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

export function Controls({ isPlaying, onPlay, onPause, onPrev, onNext }: Readonly<{
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onPrev: () => void;
  onNext: () => void;
}>) {
  return (
    <Row gap="sm" justify="center" align="center">
      <Button onPress={onPrev} icon="skip-back" color="rgba(0,0,0,0.3)" />
      {isPlaying
        ? <Button onPress={onPause} icon="pause" color="rgba(0,0,0,0.5)" />
        : <Button onPress={onPlay} icon="play" color="rgba(0,0,0,0.5)" />}
      <Button onPress={onNext} icon="skip-forward" color="rgba(0,0,0,0.3)" />
    </Row>
  );
}

// ─── Track Info ─────────────────────────────────────────────────────────────

export function TrackInfo({ trackName, artistName }: Readonly<{
  trackName: string;
  artistName: string;
}>) {
  return (
    <Row gap="sm" align="center">
      <Text content={trackName} variant="heading" color="rgba(255,255,255,0.95)" />
      <Text content={artistName} variant="caption" color="rgba(255,255,255,0.55)" />
    </Row>
  );
}

// ─── Progress Bar ───────────────────────────────────────────────────────────

export function ProgressBar({ localProgressMs, durationMs, onSeek }: Readonly<{
  localProgressMs: number;
  durationMs: number;
  onSeek: (payload?: Record<string, unknown>) => void;
}>) {
  return (
    <Row gap="sm" align="center">
      <Text content={formatMs(localProgressMs)} variant="caption" color="rgba(255,255,255,0.55)" />
      <Box grow>
        <Slider value={progressPercent(localProgressMs, durationMs)} min={0} max={100} step={1} onChange={onSeek} color="#1DB954" />
      </Box>
      <Text content={formatMs(durationMs)} variant="caption" color="rgba(255,255,255,0.55)" />
    </Row>
  );
}

// ─── Volume Slider ──────────────────────────────────────────────────────────

export function VolumeSlider({ volume, onVolume }: Readonly<{
  volume: number;
  onVolume: (payload?: Record<string, unknown>) => void;
}>) {
  return (
    <Slider label="Volume" value={volume} min={0} max={100} step={5} unit="%" onChange={onVolume} icon="volume-2" color="rgba(255,255,255,0.6)" />
  );
}
