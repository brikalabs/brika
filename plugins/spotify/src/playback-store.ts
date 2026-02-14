/**
 * Shared playback store — one polling loop, all player bricks react.
 *
 * Built on `defineSharedStore` from the SDK. Any brick that calls
 * `usePlayerStore()` automatically re-renders when the state changes.
 */

import { log } from '@brika/sdk';
import { defineSharedStore } from '@brika/sdk/bricks/core';
import { spotify } from './index';
import { getApi, resolveDeviceId } from './shared';
import { trackChanged } from './sparks';
import type { PlaybackState, SpotifyDevice } from './spotify-api';
import { SpotifyAuthError } from './spotify-api';

// ─── Store ───────────────────────────────────────────────────────────────────

export interface Anchor { progressMs: number; timestamp: number }

interface PlayerState {
  playback: PlaybackState | null;
  devices: SpotifyDevice[];
  isAuthed: boolean;
  loaded: boolean;
  anchor: Anchor;
}

export const usePlayerStore = defineSharedStore<PlayerState>({
  playback: null,
  devices: [],
  isAuthed: false,
  loaded: false,
  anchor: { progressMs: 0, timestamp: Date.now() },
});

// ─── Polling (reference-counted) ─────────────────────────────────────────────

const POLL_MS = 3000;

let refCount = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let lastTrack = '';
let autoTransferAttempted = false;

/** Reset the polling interval so the next poll is a full POLL_MS away. */
function resetPollTimer(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = setInterval(poll, POLL_MS);
}

/** Force an immediate poll and restart the timer. */
function pollNow(): void {
  poll();
  resetPollTimer();
}

async function tryAutoTransfer(devices: SpotifyDevice[]): Promise<boolean> {
  if (autoTransferAttempted || devices.length === 0) return false;
  const prefId = resolveDeviceId();
  const targetId = prefId && devices.some((d) => d.id === prefId) ? prefId : devices[0].id;
  autoTransferAttempted = true;
  getApi().transferPlayback(targetId).then(() => pollNow());
  return true;
}

function emitTrackChanged(state: PlaybackState): void {
  if (state.trackName === lastTrack) return;
  lastTrack = state.trackName;
  trackChanged.emit({
    trackName: state.trackName,
    artistName: state.artistName,
    albumName: state.albumName,
    albumArt: state.albumArt,
    timestamp: Date.now(),
  });
}

async function poll(): Promise<void> {
  if (!spotify.isAuthenticated()) {
    usePlayerStore.set({ playback: null, devices: [], isAuthed: false, loaded: true, anchor: { progressMs: 0, timestamp: Date.now() } });
    return;
  }

  try {
    const state = await getApi().getCurrentPlayback();
    const anchor: Anchor = { progressMs: state?.progressMs ?? 0, timestamp: Date.now() };

    let devices: SpotifyDevice[] = [];
    if (state) {
      autoTransferAttempted = false;
    } else {
      devices = await getApi().getDevices();
      if (await tryAutoTransfer(devices)) return;
    }
    usePlayerStore.set({ playback: state, devices, isAuthed: true, loaded: true, anchor });

    if (state) emitTrackChanged(state);
  } catch (err) {
    if (err instanceof SpotifyAuthError) {
      usePlayerStore.set((prev) => ({ ...prev, playback: null, isAuthed: false, loaded: true }));
    } else {
      usePlayerStore.set((prev) => ({ ...prev, loaded: true }));
    }
  }
}

/** Acquire polling — starts on first subscriber, stops on last. */
export function acquirePolling(): () => void {
  refCount++;
  if (refCount === 1) {
    // Sync auth state immediately so bricks don't flash the login screen
    const authed = spotify.isAuthenticated();
    if (authed !== usePlayerStore.get().isAuthed) {
      usePlayerStore.set((prev) => ({ ...prev, isAuthed: authed }));
    }
    poll();
    timer = setInterval(poll, POLL_MS);
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    refCount--;
    if (refCount === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/** Catch and log errors from fire-and-forget API calls. */
function silent(promise: Promise<unknown>): void {
  promise.catch((err) => {
    log.error(`Spotify API error: ${err instanceof Error ? err.message : String(err)}`);
  });
}

export function play(deviceId?: string): void {
  silent(getApi().play(deviceId));
  usePlayerStore.set((prev) => {
    if (!prev.playback) return prev;
    const elapsed = Date.now() - prev.anchor.timestamp;
    return {
      ...prev,
      playback: { ...prev.playback, isPlaying: true },
      anchor: { progressMs: prev.anchor.progressMs + elapsed, timestamp: Date.now() },
    };
  });
  resetPollTimer();
}

export function pause(deviceId?: string): void {
  silent(getApi().pause(deviceId));
  usePlayerStore.set((prev) => {
    if (!prev.playback) return prev;
    const elapsed = Date.now() - prev.anchor.timestamp;
    const progressMs = Math.min(prev.anchor.progressMs + elapsed, prev.playback.durationMs);
    return {
      ...prev,
      playback: { ...prev.playback, isPlaying: false },
      anchor: { progressMs, timestamp: Date.now() },
    };
  });
  resetPollTimer();
}

export function next(): void {
  silent(getApi().next().then(() => pollNow()));
}

export function previous(): void {
  silent(getApi().previous().then(() => pollNow()));
}

export function seek(positionMs: number): void {
  silent(getApi().seek(positionMs));
  usePlayerStore.set((prev) => ({
    ...prev,
    playback: prev.playback ? { ...prev.playback, progressMs: positionMs } : null,
    anchor: { progressMs: positionMs, timestamp: Date.now() },
  }));
  resetPollTimer();
}

export function setVolume(percent: number): void {
  silent(getApi().setVolume(percent));
  usePlayerStore.set((prev) => {
    if (!prev.playback) return prev;
    return { ...prev, playback: { ...prev.playback, volume: percent } };
  });
  resetPollTimer();
}

export function transferPlayback(deviceId: string): void {
  silent(getApi().transferPlayback(deviceId).then(() => pollNow()));
}

export async function startPlayback(deviceId?: string): Promise<void> {
  if (deviceId) await getApi().transferPlayback(deviceId);
  const contextUri = await getApi().getRecentlyPlayed();
  await getApi().play(deviceId, contextUri ?? undefined);
  pollNow();
}
