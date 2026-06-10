/**
 * Now Playing brick descriptor: a minimal read-only widget for dashboards
 * that just want the current track, without the full player controls.
 * Imported by index.tsx (`data.set`) and now-playing.tsx (`data.use`).
 */

import { z } from '@brika/sdk';
import { defineBrick } from '@brika/sdk/brick';
import type { NowPlayingData } from './now-playing';

export const nowPlayingBrick = defineBrick({
  id: 'now-playing',
  meta: {
    name: 'Now Playing',
    description: 'Compact current-track widget (album art, title, artist)',
    category: 'media',
    icon: 'disc-3',
    color: '#1DB954',
  },
  config: z.object({}),
  data: z.custom<NowPlayingData>(),
});
