import { defineOAuth, definePreferenceOptions } from '@brika/sdk';
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

// ─── Bricks ───────────────────────────────────────────────────────────────────

export { playerBrick } from './bricks/player';

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onStop(() => {
  log.info('Spotify plugin stopping');
});

log.info('Spotify plugin loaded');
