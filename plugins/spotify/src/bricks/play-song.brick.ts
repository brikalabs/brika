/**
 * "Play a Song" brick descriptor: id, display meta, typed per-instance config,
 * and the data channel shared with the plugin process. Imported by index.tsx
 * (`data.set`) and play-song.tsx (`data.use`); the payload type lives with the view.
 */

import { z } from '@brika/sdk';
import { defineBrick } from '@brika/sdk/brick';
import type { PlaySongData } from './play-song';

export const playSongBrick = defineBrick({
  id: 'play-song',
  meta: {
    name: 'Play a Song',
    description: 'Search Spotify and play any track with one tap',
    category: 'media',
    icon: 'search',
    color: '#1DB954',
  },
  config: z.object({
    device: z
      .dynamicDropdown({ label: 'Device', description: 'Device to play searched songs on' })
      .optional(),
  }),
  data: z.custom<PlaySongData>(),
});
