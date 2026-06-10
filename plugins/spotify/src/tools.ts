/**
 * Spotify Plugin Tools
 *
 * Hub-wide, AI-discoverable capabilities. The actions in `actions.ts` serve
 * this plugin's own bricks; these tools register the same capabilities in the
 * global registry so an AI Agent (or any tool caller) can search the catalog,
 * start a track, and drive playback by id alone: "play some jazz" becomes
 * search-tracks then play-track with no Spotify knowledge hard-coded anywhere.
 *
 * They reuse the same playback-store/API primitives as the actions, so all
 * control flows through one code path.
 */

import { defineTool, z } from '@brika/sdk';
import {
  next,
  pause,
  play,
  previous,
  seek,
  setVolume,
  startPlayback,
  usePlayerStore,
} from './playback-store';
import { getApi, resolveDeviceId } from './shared';

function resolveTarget(deviceId?: string): string | undefined {
  const id = resolveDeviceId(deviceId);
  return id ?? usePlayerStore.get().devices[0]?.id;
}

const controlSchema = z.enum(['play', 'pause', 'next', 'previous', 'seek', 'set-volume']);

defineTool(
  {
    id: 'get-now-playing',
    description:
      'The track currently playing (or most recently played) on Spotify: track name, artist, album art URL, and whether playback is active.',
    icon: 'music',
    color: '#1DB954',
    input: z.object({}),
  },
  () => {
    const { playback, recentTrack } = usePlayerStore.get();
    const track = playback ?? recentTrack;
    if (!track) {
      return { playing: false };
    }
    return {
      playing: playback?.isPlaying ?? false,
      trackName: track.trackName,
      artistName: track.artistName,
      albumArt: track.albumArt,
    };
  }
);

defineTool(
  {
    id: 'search-tracks',
    description:
      'Search the Spotify catalog for tracks by free text (title, artist, album). Returns up to `limit` results with uri, name, artist, and album art; pass a uri to play-track.',
    icon: 'search',
    color: '#1DB954',
    input: z.object({
      query: z.string().min(1).describe('Free-text search (e.g. "plastic love takeuchi")'),
      limit: z.number().int().min(1).max(50).default(10).describe('Max results'),
    }),
  },
  async ({ query, limit }) => {
    const results = await getApi().searchTracks(query, limit);
    return {
      tracks: results.map((track) => ({
        uri: track.uri,
        name: track.name,
        artist: track.artist,
        albumArt: track.albumArt,
      })),
    };
  }
);

defineTool(
  {
    id: 'play-track',
    description:
      'Start playback of a specific track by Spotify uri (from search-tracks), optionally on a specific device (from list-devices).',
    icon: 'play',
    color: '#1DB954',
    input: z.object({
      uri: z.string().min(1).describe('Track uri, e.g. spotify:track:...'),
      deviceId: z.string().optional().describe('Target device id (from list-devices)'),
    }),
  },
  async ({ uri, deviceId }) => {
    await getApi().play(resolveTarget(deviceId), uri);
    return { ok: true };
  }
);

defineTool(
  {
    id: 'control-playback',
    description:
      'Control Spotify playback: play (resume or start), pause, next, previous, seek (positionMs), or set-volume (percent 0-100). Optionally target a device from list-devices.',
    icon: 'sliders-horizontal',
    color: '#1DB954',
    input: z.object({
      command: controlSchema.describe('Playback command'),
      deviceId: z.string().optional().describe('Target device id (from list-devices)'),
      positionMs: z.number().int().min(0).optional().describe('Seek position in ms (seek only)'),
      percent: z
        .number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .describe('Volume 0-100 (set-volume only)'),
    }),
  },
  async (parsed) => {
    const target = resolveTarget(parsed.deviceId);

    switch (parsed.command) {
      case 'play':
        if (usePlayerStore.get().playback) {
          play(target);
        } else {
          await startPlayback(target);
        }
        break;
      case 'pause':
        pause(target);
        break;
      case 'next':
        next();
        break;
      case 'previous':
        previous();
        break;
      case 'seek':
        if (parsed.positionMs === undefined) {
          return { ok: false, error: 'seek requires positionMs' };
        }
        seek(parsed.positionMs);
        break;
      case 'set-volume':
        if (parsed.percent === undefined) {
          return { ok: false, error: 'set-volume requires percent' };
        }
        setVolume(parsed.percent);
        break;
    }
    return { ok: true };
  }
);

defineTool(
  {
    id: 'list-devices',
    description:
      'List the available Spotify Connect devices (speakers, computers, phones) with their id, name, and type. Use a device id with play-track or control-playback.',
    icon: 'speaker',
    color: '#1DB954',
    input: z.object({}),
  },
  async () => {
    const devices = await getApi().getDevices();
    return {
      devices: devices.map((device) => ({ id: device.id, name: device.name, type: device.type })),
    };
  }
);
