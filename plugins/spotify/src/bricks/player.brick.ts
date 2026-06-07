/**
 * Spotify player brick descriptor: id, display meta, typed per-instance config,
 * and the data channel shared with the plugin process. Imported by index.tsx
 * (`data.set`) and player.tsx (`data.use`); the payload type lives with the view.
 */

import { z } from '@brika/sdk';
import { defineBrick } from '@brika/sdk/brick';
import type { SpotifyPlayerData } from './player';

export const playerBrick = defineBrick({
  id: 'player',
  meta: {
    name: 'Spotify Player',
    description: 'Control Spotify playback and display album art',
    category: 'media',
    icon: 'music',
    color: '#1DB954',
  },
  config: z.object({
    device: z
      .dynamicDropdown({
        label: 'Device',
        description: 'Override the default device for this brick',
      })
      .optional(),
    refreshInterval: z
      .number()
      .min(1000)
      .max(30000)
      .multipleOf(1000)
      .default(3000)
      .meta({ label: 'Refresh interval (ms)' }),
  }),
  data: z.custom<SpotifyPlayerData>(),
});
