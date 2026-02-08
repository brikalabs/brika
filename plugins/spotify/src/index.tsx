import { defineOAuth } from '@brika/sdk';
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
  ],
  clientIdPreference: 'clientId',
});

// ─── Sparks ───────────────────────────────────────────────────────────────────

export { trackChanged } from './sparks';

// ─── Bricks ───────────────────────────────────────────────────────────────────

export { playerBrick } from './bricks/player';

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onStop(() => {
  log.info('Spotify plugin stopping');
});

log.info('Spotify plugin loaded');
