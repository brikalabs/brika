import { defineSpark, z } from '@brika/sdk/sparks';

/** Emitted whenever the playing track changes. */
export const trackChanged = defineSpark({
  id: 'track-changed',
  meta: { name: 'Track Changed', description: 'Emitted when the playing track changes' },
  schema: z.object({
    trackName: z.string(),
    artistName: z.string(),
    albumName: z.string(),
    albumArt: z.string().nullable(),
    timestamp: z.number(),
  }),
});

/** Emitted when playback resumes (paused -> playing). */
export const playbackStarted = defineSpark({
  id: 'playback-started',
  meta: { name: 'Playback Started', description: 'Emitted when playback resumes' },
  schema: z.object({
    trackName: z.string(),
    artistName: z.string(),
    deviceName: z.string(),
    timestamp: z.number(),
  }),
});

/** Emitted when playback pauses or stops (playing -> paused/stopped). */
export const playbackPaused = defineSpark({
  id: 'playback-paused',
  meta: { name: 'Playback Paused', description: 'Emitted when playback pauses or stops' },
  schema: z.object({
    trackName: z.string(),
    artistName: z.string(),
    deviceName: z.string(),
    timestamp: z.number(),
  }),
});

/** Emitted when the active device's volume changes. */
export const volumeChanged = defineSpark({
  id: 'volume-changed',
  meta: { name: 'Volume Changed', description: 'Emitted when the active device volume changes' },
  schema: z.object({
    volume: z.number(),
    deviceName: z.string(),
    timestamp: z.number(),
  }),
});

/** Emitted when playback moves to a different device. */
export const deviceChanged = defineSpark({
  id: 'device-changed',
  meta: {
    name: 'Device Changed',
    description: 'Emitted when playback moves to a different device',
  },
  schema: z.object({
    deviceName: z.string(),
    timestamp: z.number(),
  }),
});
