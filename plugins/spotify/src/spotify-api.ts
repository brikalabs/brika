/**
 * Spotify Web API wrapper using the OAuth client.
 */

import type { OAuthClient } from '@brika/sdk';

const BASE = 'https://api.spotify.com/v1';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SpotifyImage {
  url: string;
  width: number;
  height: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  trackName: string;
  artistName: string;
  albumName: string;
  albumArt: string | null;
  progressMs: number;
  durationMs: number;
  volume: number;
  deviceName: string;
}

export interface RecentTrack {
  trackName: string;
  artistName: string;
  albumArt: string | null;
  uri: string;
}

export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  volumePercent: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Factory
// ─────────────────────────────────────────────────────────────────────────────

/** Thrown when the Spotify API returns 401 — signals re-auth is needed. */
export class SpotifyAuthError extends Error {
  constructor() {
    super('Spotify token expired or revoked');
    this.name = 'SpotifyAuthError';
  }
}

function pickArt(images: SpotifyImage[]): string | null {
  const art = images.find((i) => i.width === 640) ?? images[0];
  return art?.url ?? null;
}

export function createSpotifyApi(oauth: OAuthClient) {
  async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
    if (!oauth.isAuthenticated()) return null;

    const res = await oauth.fetch(`${BASE}${path}`, init);

    // 204 = no active device/playback — legitimate "no data"
    if (res.status === 204) return null;

    // 401 = token invalid — bubble up so the brick can reset auth state
    if (res.status === 401) throw new SpotifyAuthError();

    // Other errors — return null (rate-limit, server error, etc.)
    if (!res.ok) return null;

    // Some endpoints return empty bodies (play, pause, next, previous)
    const text = await res.text();
    if (!text) return null;

    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  return {
    async getCurrentPlayback(): Promise<PlaybackState | null> {
      const data = await api<{
        is_playing: boolean;
        progress_ms: number;
        item: {
          name: string;
          duration_ms: number;
          artists: { name: string }[];
          album: {
            name: string;
            images: SpotifyImage[];
          };
        } | null;
        device: {
          name: string;
          volume_percent: number;
        };
      }>('/me/player');

      if (!data?.item) return null;

      return {
        isPlaying: data.is_playing,
        trackName: data.item.name,
        artistName: data.item.artists.map((a) => a.name).join(', '),
        albumName: data.item.album.name,
        albumArt: pickArt(data.item.album.images),
        progressMs: data.progress_ms,
        durationMs: data.item.duration_ms,
        volume: data.device.volume_percent,
        deviceName: data.device.name,
      };
    },

    async play(deviceId?: string, contextUri?: string): Promise<void> {
      const qs = deviceId ? `?device_id=${deviceId}` : '';
      let body: string | undefined;
      if (contextUri) {
        const payload = contextUri.includes(':track:')
          ? { uris: [contextUri] }
          : { context_uri: contextUri };
        body = JSON.stringify(payload);
      }
      await api(`/me/player/play${qs}`, {
        method: 'PUT',
        ...(body && { headers: { 'Content-Type': 'application/json' }, body }),
      });
    },

    async pause(deviceId?: string): Promise<void> {
      const qs = deviceId ? `?device_id=${deviceId}` : '';
      await api(`/me/player/pause${qs}`, { method: 'PUT' });
    },

    async next(): Promise<void> {
      await api('/me/player/next', { method: 'POST' });
    },

    async previous(): Promise<void> {
      await api('/me/player/previous', { method: 'POST' });
    },

    async seek(positionMs: number): Promise<void> {
      const ms = Math.round(Math.max(0, positionMs));
      await api(`/me/player/seek?position_ms=${ms}`, { method: 'PUT' });
    },

    async setVolume(percent: number): Promise<void> {
      const vol = Math.round(Math.max(0, Math.min(100, percent)));
      await api(`/me/player/volume?volume_percent=${vol}`, { method: 'PUT' });
    },

    async transferPlayback(deviceId: string): Promise<void> {
      await api('/me/player', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_ids: [deviceId], play: false }),
      });
    },

    async getRecentlyPlayed(): Promise<RecentTrack | null> {
      const data = await api<{
        items: Array<{
          context?: { uri: string };
          track: {
            uri: string;
            name: string;
            artists: { name: string }[];
            album: { images: SpotifyImage[] };
          };
        }>;
      }>('/me/player/recently-played?limit=1');
      if (!data?.items?.[0]) return null;
      const { context, track } = data.items[0];
      return {
        trackName: track.name,
        artistName: track.artists.map((a) => a.name).join(', '),
        albumArt: pickArt(track.album.images),
        uri: context?.uri ?? track.uri,
      };
    },

    async getDevices(): Promise<SpotifyDevice[]> {
      const data = await api<{
        devices: {
          id: string;
          name: string;
          type: string;
          is_active: boolean;
          volume_percent: number;
        }[];
      }>('/me/player/devices');

      if (!data) return [];

      return data.devices.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        isActive: d.is_active,
        volumePercent: d.volume_percent,
      }));
    },
  };
}

export type SpotifyApi = ReturnType<typeof createSpotifyApi>;
