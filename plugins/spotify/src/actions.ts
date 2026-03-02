/**
 * Server-side actions for the Spotify player brick.
 *
 * Client-side bricks import these refs — the module compiler replaces them
 * with `{ __actionId }` stubs at build time. The plugin process handles
 * the actual Spotify API calls when the hub forwards the action.
 */

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
import { resolveDeviceId } from './shared';

function resolveTarget(deviceId?: string): string | undefined {
  const id = resolveDeviceId(deviceId);
  return id ?? usePlayerStore.get().devices[0]?.id;
}

export const doPlay = defineAction(async (input?: { deviceId?: string }) => {
  const target = resolveTarget(input?.deviceId);
  const { playback } = usePlayerStore.get();
  if (playback) play(target);
  else await startPlayback(target);
});

export const doPause = defineAction(async (input?: { deviceId?: string }) => {
  pause(resolveTarget(input?.deviceId));
});

export const doNext = defineAction(async () => {
  next();
});

export const doPrevious = defineAction(async () => {
  previous();
});

export const doSeek = defineAction(async (input: { positionMs: number }) => {
  seek(input.positionMs);
});

export const doSetVolume = defineAction(async (input: { percent: number }) => {
  setVolume(input.percent);
});
