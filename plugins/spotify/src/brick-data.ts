/**
 * Typed brick-data channels for the Spotify bricks.
 *
 * Declared once and imported by both the plugin process (index.tsx, which calls
 * `.set(...)`) and the client views (player.tsx / play-song.tsx, which call
 * `.use()`), so the brick id and payload type are shared across the boundary.
 */

import { defineBrickData } from '@brika/sdk/brick-views';
import type { PlaybackState, RecentTrack } from './spotify-api';

export interface SpotifyPlayerData {
  playback: PlaybackState | null;
  recentTrack: RecentTrack | null;
  isAuthed: boolean;
  loaded: boolean;
  anchor: { progressMs: number; timestamp: number };
  authUrl: string;
}

export interface PlaySongData {
  isAuthed: boolean;
  authUrl: string;
}

export const playerData = defineBrickData<SpotifyPlayerData>('player');
export const playSongData = defineBrickData<PlaySongData>('play-song');
