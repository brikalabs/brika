/**
 * The Spotify OAuth client, in its own module so blocks/bricks/stores can import
 * it without pulling the plugin entry (index.tsx) and its polling/lifecycle. The
 * entry, shared.ts, and playback-store.ts all import `spotify` from here.
 */

import { defineOAuth } from '@brika/sdk';

/**
 * Brika-registered public Spotify app client id. With PKCE (the SDK default)
 * no client secret is needed, so shipping a public client id makes Spotify
 * fully automatic: the user only clicks "Connect" once, never registers an app.
 *
 * When this is empty the plugin falls back to the optional per-user `clientId`
 * preference, so existing self-hosted setups keep working.
 */
const BRIKA_SPOTIFY_CLIENT_ID = 'efa61a6207684525a1bdc3f6b0be4ee2';

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
  ...(BRIKA_SPOTIFY_CLIENT_ID
    ? { clientId: BRIKA_SPOTIFY_CLIENT_ID }
    : { clientIdPreference: 'clientId' }),
});
