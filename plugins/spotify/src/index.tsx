import { defineOAuth, definePreferenceOptions, setBrickData } from '@brika/sdk';
import { log, onStop } from '@brika/sdk/lifecycle';

// ─── OAuth ────────────────────────────────────────────────────────────────────

export const spotify = defineOAuth({
  id: 'spotify',
  authorizeUrl: 'https://accounts.spotify.com/authorize',
  tokenUrl: 'https://accounts.spotify.com/api/token',
  scopes: [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'user-read-recently-played',
  ],
  clientIdPreference: 'clientId',
});

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

export { trackChanged } from './sparks';

// ─── Blocks ───────────────────────────────────────────────────────────────────

export { playBlock } from './blocks/play';

// ─── Actions (registers defineAction handlers for client-side brick) ─────────

import './actions';

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
  setBrickData('player', {
    playback: state.playback,
    recentTrack: state.recentTrack,
    isAuthed: state.isAuthed,
    loaded: state.loaded,
    anchor: state.anchor,
    authUrl: spotify.getAuthUrl(),
  });
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onStop(() => {
  releasePolling();
  log.info('Spotify plugin stopping');
});

log.info('Spotify plugin loaded');
