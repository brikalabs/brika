/**
 * Camera brick descriptor. Config-only (no server-pushed data), so `data` is an
 * empty object schema. `brika build` reads this for the manifest.
 */

import { z } from '@brika/sdk';
import { defineBrick } from '@brika/sdk/brick';

export const cameraBrick = defineBrick({
  id: 'camera',
  meta: {
    name: 'Live Video',
    description: 'HLS video stream with controls',
    category: 'media',
    icon: 'video',
    color: '#ef4444',
  },
  config: z.object({
    defaultStream: z
      .enum(['Big Buck Bunny', 'Elephants Dream', 'Sintel'])
      .default('Big Buck Bunny')
      .meta({ label: 'Default Stream' }),
    muted: z
      .boolean()
      .default(true)
      .meta({ label: 'Muted by default' })
      .describe('Start the stream muted'),
  }),
  data: z.object({}),
});
