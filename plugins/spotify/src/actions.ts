/**
 * Server-side actions for the Spotify player brick.
 *
 * Client-side bricks import these refs — the module compiler replaces them
 * with `{ __actionId }` stubs at build time. The plugin process handles
 * the actual Spotify API calls when the hub forwards the action.
 */

import { capture } from '@brika/sdk';
import { defineAction } from '@brika/sdk/actions';
import {
  next,
  pause,
  play,
  previous,
  seek,
  setVolume,
  startPlayback,
  usePlayerStore,
} from './playback-store';
import { getApi, resolveDeviceId } from './shared';

function resolveTarget(deviceId?: string): string | undefined {
  const id = resolveDeviceId(deviceId);
  return id ?? usePlayerStore.get().devices[0]?.id;
}

// ─── Block-view data ──────────────────────────────────────────────────────────

/** Current track summary surfaced on the Play block's canvas node. */
export interface NowPlaying {
  trackName: string;
  artistName: string;
  albumArt: string | null;
  isPlaying: boolean;
}

/**
 * Read the currently playing (or most recently played) track from the shared
 * player store. Returns null when nothing is available (not authed / idle).
 * Consumed by the Play block's node view via `useAction(getNowPlaying)`.
 */
export const getNowPlaying = defineAction(async (): Promise<NowPlaying | null> => {
  const { playback, recentTrack } = usePlayerStore.get();
  const track = playback ?? recentTrack;
  if (!track) {
    return null;
  }
  return {
    trackName: track.trackName,
    artistName: track.artistName,
    albumArt: track.albumArt,
    isPlaying: playback?.isPlaying ?? false,
  };
});

/** A selectable Spotify Connect device option. */
export interface DeviceOption {
  value: string;
  label: string;
}

/**
 * List available Spotify Connect devices as `{ value, label }` options.
 * Consumed by the Play block's config view device picker.
 */
export const listDevices = defineAction(async (): Promise<DeviceOption[]> => {
  const devices = await getApi().getDevices();
  return devices.map((device) => ({
    value: device.id,
    label: `${device.name} (${device.type})`,
  }));
});

export const doPlay = defineAction(async (input?: { deviceId?: string }) => {
  const target = resolveTarget(input?.deviceId);
  const { playback } = usePlayerStore.get();
  if (playback) {
    play(target);
    capture('spotify.playback_resumed', { hasTarget: target !== undefined });
  } else {
    await startPlayback(target);
    capture('spotify.playback_started', { hasTarget: target !== undefined });
  }
});

export const doPause = defineAction(async (input?: { deviceId?: string }) => {
  pause(resolveTarget(input?.deviceId));
  capture('spotify.playback_paused');
});

export const doNext = defineAction(async () => {
  next();
  capture('spotify.track_skipped', { direction: 'next' });
});

export const doPrevious = defineAction(async () => {
  previous();
  capture('spotify.track_skipped', { direction: 'previous' });
});

export const doSeek = defineAction(async (input: { positionMs: number }) => {
  seek(input.positionMs);
  capture('spotify.track_seeked', { positionMs: input.positionMs });
});

export const doSetVolume = defineAction(async (input: { percent: number }) => {
  setVolume(input.percent);
  capture('spotify.volume_set', { percent: input.percent });
});
