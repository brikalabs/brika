import { definePreferenceOptions } from '@brika/sdk';
import { log, onStop } from '@brika/sdk/lifecycle';
import { nowPlayingBrick } from './bricks/now-playing.brick';
import { playSongBrick } from './bricks/play-song.brick';
import { playerBrick } from './bricks/player.brick';
import { spotify } from './spotify-client';

// ─── OAuth ────────────────────────────────────────────────────────────────────

// The OAuth client lives in ./spotify-client so it can be imported without the
// entry's polling/lifecycle. Re-export it for back-compat with `from './index'`.
export { spotify } from './spotify-client';

// ─── Dynamic Preferences ─────────────────────────────────────────────────────

// Lazy import to break the circular dependency (shared.ts imports spotify from here)
async function fetchDeviceOptions() {
  const { getApi } = await import('./shared');
  const devices = await getApi().getDevices();
  return devices.map((d) => ({ value: d.id, label: `${d.name} (${d.type})` }));
}

definePreferenceOptions('defaultDevice', fetchDeviceOptions);
definePreferenceOptions('device', fetchDeviceOptions);

// ─── Sparks ───────────────────────────────────────────────────────────────────

export {
  deviceChanged,
  playbackPaused,
  playbackStarted,
  trackChanged,
  volumeChanged,
} from './sparks';

// ─── Blocks ───────────────────────────────────────────────────────────────────

export { playBlock } from './blocks/play';

// ─── Actions (registers defineAction handlers for client-side brick) ─────────

import './actions';
import './tools';

// ─── Bricks ───────────────────────────────────────────────────────────────────

// Player brick is client-rendered — no server-side defineBrick export needed.
// Brick type is registered from package.json metadata.

// ─── Client-side data push ───────────────────────────────────────────────────

import { acquirePolling, usePlayerStore } from './playback-store';

// Start polling immediately so data is ready when the brick mounts
const releasePolling = acquirePolling();

// Push player state to client bricks whenever the store changes
usePlayerStore.subscribe(() => {
  const state = usePlayerStore.get();
  playerBrick.data.set({
    playback: state.playback,
    recentTrack: state.recentTrack,
    isAuthed: state.isAuthed,
    loaded: state.loaded,
    anchor: state.anchor,
    authUrl: spotify.getAuthUrl(),
  });
  // The "Play a Song" card only needs auth state; search runs via actions.
  playSongBrick.data.set({
    isAuthed: state.isAuthed,
    authUrl: spotify.getAuthUrl(),
  });
  const track = state.playback ?? state.recentTrack;
  nowPlayingBrick.data.set({
    trackName: track?.trackName ?? null,
    artistName: track?.artistName ?? null,
    albumArt: track?.albumArt ?? null,
    isPlaying: state.playback?.isPlaying ?? false,
    isAuthed: state.isAuthed,
  });
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onStop(() => {
  releasePolling();
  log.info('Spotify plugin stopping');
});

log.info('Spotify plugin loaded');
