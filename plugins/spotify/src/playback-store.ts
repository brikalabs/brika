/**
 * Shared playback store — one polling loop, all player bricks react.
 *
 * Built on `defineSharedStore` from the SDK. Any brick that calls
 * `usePlayerStore()` automatically re-renders when the state changes.
 */

import { defineSharedStore } from '@brika/sdk/bricks/core';
import type { PlaybackState } from './spotify-api';
import { SpotifyAuthError, createSpotifyApi } from './spotify-api';
import { spotify } from './index';
import { trackChanged } from './sparks';

// ─── Store ───────────────────────────────────────────────────────────────────

export interface Anchor { progressMs: number; timestamp: number }

interface PlayerState {
  playback: PlaybackState | null;
  isAuthed: boolean;
  loaded: boolean;
  anchor: Anchor;
}

export const usePlayerStore = defineSharedStore<PlayerState>({
  playback: null,
  isAuthed: false,
  loaded: false,
  anchor: { progressMs: 0, timestamp: Date.now() },
});

// ─── Polling (reference-counted) ─────────────────────────────────────────────

const POLL_MS = 3000;

/** Lazily initialized — avoids circular import with index.tsx */
let api: ReturnType<typeof createSpotifyApi> | null = null;
function getApi() {
  api ??= createSpotifyApi(spotify);
  return api;
}

let refCount = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let lastTrack = '';

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

async function poll(): Promise<void> {
  const authed = spotify.isAuthenticated();
  if (!authed) {
    usePlayerStore.set({ playback: null, isAuthed: false, loaded: true, anchor: { progressMs: 0, timestamp: Date.now() } });
    return;
  }

  try {
    const state = await getApi().getCurrentPlayback();
    const anchor: Anchor = { progressMs: state?.progressMs ?? 0, timestamp: Date.now() };
    usePlayerStore.set({ playback: state, isAuthed: true, loaded: true, anchor });

    if (state && state.trackName !== lastTrack) {
      lastTrack = state.trackName;
      trackChanged.emit({
        trackName: state.trackName,
        artistName: state.artistName,
        albumName: state.albumName,
        albumArt: state.albumArt,
        timestamp: Date.now(),
      });
    }
  } catch (err) {
    if (err instanceof SpotifyAuthError) {
      usePlayerStore.set((prev) => ({ ...prev, playback: null, isAuthed: false, loaded: true }));
    } else {
      // Network/timeout errors — mark loaded so bricks don't stay on "Connecting…"
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

export function play(): void {
  getApi().play();
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

export function pause(): void {
  getApi().pause();
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
  getApi().next().then(() => pollNow());
}

export function previous(): void {
  getApi().previous().then(() => pollNow());
}

export function seek(positionMs: number): void {
  getApi().seek(positionMs);
  usePlayerStore.set((prev) => ({
    ...prev,
    playback: prev.playback ? { ...prev.playback, progressMs: positionMs } : null,
    anchor: { progressMs: positionMs, timestamp: Date.now() },
  }));
  resetPollTimer();
}

export function setVolume(percent: number): void {
  getApi().setVolume(percent);
  usePlayerStore.set((prev) => {
    if (!prev.playback) return prev;
    return { ...prev, playback: { ...prev.playback, volume: percent } };
  });
  resetPollTimer();
}
