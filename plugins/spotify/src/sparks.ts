import { defineSpark, z } from '@brika/sdk/sparks';

export const trackChanged = defineSpark({
  id: 'track-changed',
  schema: z.object({
    trackName: z.string(),
    artistName: z.string(),
    albumName: z.string(),
    albumArt: z.string().nullable(),
    timestamp: z.number(),
  }),
});
