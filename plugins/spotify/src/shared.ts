/**
 * Shared helpers for the Spotify plugin.
 *
 * Uses lazy initialization to avoid circular imports — `spotify` (the OAuth
 * client) is exported from `index.tsx`, which re-exports bricks/blocks/sparks
 * that also need the API.
 */

import { getPreferences } from '@brika/sdk';
import { spotify } from './index';
import { createSpotifyApi } from './spotify-api';

// ─── Lazy API singleton ───────────────────────────────────────────────────────

let api: ReturnType<typeof createSpotifyApi> | null = null;

/** Return (or create) the shared Spotify API instance. */
export function getApi(): ReturnType<typeof createSpotifyApi> {
  api ??= createSpotifyApi(spotify);
  return api;
}

// ─── Device resolution ────────────────────────────────────────────────────────

/**
 * Resolve the best device ID from instance config → plugin preference → undefined.
 * Callers can further fall back to `devices[0]?.id` when a list is available.
 */
export function resolveDeviceId(instanceDeviceId?: string): string | undefined {
  const id = instanceDeviceId?.trim() || undefined;
  if (id) return id;
  const prefs = getPreferences<{ defaultDevice?: string }>();
  return prefs.defaultDevice?.trim() || undefined;
}

/**
 * Resolve a device value that may be an ID or a name.
 * Fetches the device list and matches by ID first, then by name (case-insensitive).
 */
export async function resolveDevice(value?: string): Promise<string | undefined> {
  const id = resolveDeviceId(value);
  if (!id) return undefined;

  const devices = await getApi().getDevices();
  // Exact ID match — return as-is
  if (devices.some((d) => d.id === id)) return id;
  // Name match (case-insensitive)
  const byName = devices.find((d) => d.name.toLowerCase() === id.toLowerCase());
  return byName?.id ?? id;
}

// ─── Spotify URI helpers ──────────────────────────────────────────────────────

const SPOTIFY_URL_RE = /^https?:\/\/open\.spotify\.com\/(track|album|playlist)\/([A-Za-z0-9]+)/;

/**
 * Normalize a Spotify URL or URI to a proper `spotify:type:id` URI.
 * Accepts:
 *   - `spotify:track:ABC123` → returned as-is
 *   - `https://open.spotify.com/track/ABC123?si=...` → `spotify:track:ABC123`
 * Returns undefined for empty/invalid input.
 */
export function toSpotifyUri(input?: string): string | undefined {
  const value = input?.trim();
  if (!value) return undefined;
  if (value.startsWith('spotify:')) return value;
  const match = SPOTIFY_URL_RE.exec(value);
  if (match) return `spotify:${match[1]}:${match[2]}`;
  return undefined;
}
