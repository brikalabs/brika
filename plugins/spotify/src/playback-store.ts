/**
 * Shared playback store — one polling loop, all player bricks react.
 *
 * Built on `defineSharedStore` from the SDK. Any brick that calls
 * `usePlayerStore()` automatically re-renders when the state changes.
 */

import { defineSharedStore, log } from '@brika/sdk';
import { getApi } from './shared';
import {
  deviceChanged,
  playbackPaused,
  playbackStarted,
  trackChanged,
  volumeChanged,
} from './sparks';
import type { PlaybackState, RecentTrack, SpotifyDevice } from './spotify-api';
import { SpotifyAuthError } from './spotify-api';
import { spotify } from './spotify-client';

// ─── Store ───────────────────────────────────────────────────────────────────

export interface Anchor {
  progressMs: number;
  timestamp: number;
}

interface PlayerState {
  playback: PlaybackState | null;
  recentTrack: RecentTrack | null;
  devices: SpotifyDevice[];
  isAuthed: boolean;
  loaded: boolean;
  anchor: Anchor;
}

export const usePlayerStore = defineSharedStore<PlayerState>({
  playback: null,
  recentTrack: null,
  devices: [],
  isAuthed: false,
  loaded: false,
  anchor: { progressMs: 0, timestamp: Date.now() },
});

// ─── Polling (reference-counted) ─────────────────────────────────────────────

const POLL_MS = 3000;

let refCount = 0;
let timer: ReturnType<typeof setInterval> | null = null;

/** Snapshot of the last seen playback, used to diff and emit change sparks. */
interface PlaybackSnapshot {
  trackName: string;
  artistName: string;
  isPlaying: boolean;
  volume: number;
  deviceName: string;
}
let prevSnapshot: PlaybackSnapshot | null = null;

/** Reset the polling interval so the next poll is a full POLL_MS away. */
function resetPollTimer(): void {
  if (!timer) {
    return;
  }
  clearInterval(timer);
  timer = setInterval(poll, POLL_MS);
}

/** Force an immediate poll and restart the timer. */
function pollNow(): void {
  poll();
  resetPollTimer();
}

/**
 * Diff the latest playback against the previous snapshot and emit a spark for
 * each thing that changed: track, play/pause, volume, and device. First sample
 * only emits track-changed (no prior state to compare transitions against).
 */
function emitPlaybackEvents(state: PlaybackState | null): void {
  const now = Date.now();

  if (!state) {
    // Playback stopped or no active device: surface a pause once.
    if (prevSnapshot?.isPlaying) {
      playbackPaused.emit({
        trackName: prevSnapshot.trackName,
        artistName: prevSnapshot.artistName,
        deviceName: prevSnapshot.deviceName,
        timestamp: now,
      });
    }
    prevSnapshot = null;
    return;
  }

  if (prevSnapshot?.trackName !== state.trackName) {
    trackChanged.emit({
      trackName: state.trackName,
      artistName: state.artistName,
      albumName: state.albumName,
      albumArt: state.albumArt,
      timestamp: now,
    });
  }

  if (prevSnapshot && prevSnapshot.isPlaying !== state.isPlaying) {
    const payload = {
      trackName: state.trackName,
      artistName: state.artistName,
      deviceName: state.deviceName,
      timestamp: now,
    };
    if (state.isPlaying) {
      playbackStarted.emit(payload);
    } else {
      playbackPaused.emit(payload);
    }
  }

  if (prevSnapshot && prevSnapshot.volume !== state.volume) {
    volumeChanged.emit({ volume: state.volume, deviceName: state.deviceName, timestamp: now });
  }

  if (prevSnapshot && prevSnapshot.deviceName !== state.deviceName) {
    deviceChanged.emit({ deviceName: state.deviceName, timestamp: now });
  }

  prevSnapshot = {
    trackName: state.trackName,
    artistName: state.artistName,
    isPlaying: state.isPlaying,
    volume: state.volume,
    deviceName: state.deviceName,
  };
}

async function poll(): Promise<void> {
  if (!spotify.isAuthenticated()) {
    usePlayerStore.set({
      playback: null,
      recentTrack: null,
      devices: [],
      isAuthed: false,
      loaded: true,
      anchor: { progressMs: 0, timestamp: Date.now() },
    });
    prevSnapshot = null;
    return;
  }

  try {
    const state = await getApi().getCurrentPlayback();
    const anchor: Anchor = { progressMs: state?.progressMs ?? 0, timestamp: Date.now() };

    let devices: SpotifyDevice[] = [];
    let recentTrack = usePlayerStore.get().recentTrack;
    if (state) {
      recentTrack = null;
    } else {
      [devices, recentTrack] = await Promise.all([
        getApi().getDevices(),
        recentTrack ? Promise.resolve(recentTrack) : getApi().getRecentlyPlayed(),
      ]);
    }
    usePlayerStore.set({
      playback: state,
      recentTrack,
      devices,
      isAuthed: true,
      loaded: true,
      anchor,
    });

    emitPlaybackEvents(state);
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
    if (released) {
      return;
    }
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
    if (!prev.playback) {
      return prev;
    }
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
    if (!prev.playback) {
      return prev;
    }
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
  silent(
    getApi()
      .next()
      .then(() => pollNow())
  );
}

export function previous(): void {
  silent(
    getApi()
      .previous()
      .then(() => pollNow())
  );
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
    if (!prev.playback) {
      return prev;
    }
    return { ...prev, playback: { ...prev.playback, volume: percent } };
  });
  resetPollTimer();
}

export async function startPlayback(deviceId?: string): Promise<void> {
  if (deviceId) {
    await getApi().transferPlayback(deviceId);
  }
  const recent = await getApi().getRecentlyPlayed();
  await getApi().play(deviceId, recent?.uri);
  pollNow();
}
