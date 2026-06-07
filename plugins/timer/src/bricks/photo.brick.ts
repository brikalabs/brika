/**
 * Photo brick descriptor. Config-only (no server-pushed data), so `data` is an
 * empty object schema. `brika build` reads this for the manifest.
 */

import { z } from '@brika/sdk';
import { defineBrick } from '@brika/sdk/brick';

export const photoBrick = defineBrick({
  id: 'photo',
  meta: {
    name: 'Photo',
    description: 'Photo showcase with auto-rotation',
    category: 'media',
    icon: 'image',
    color: '#8b5cf6',
  },
  config: z.object({
    autoRotate: z
      .boolean()
      .default(true)
      .meta({ label: 'Auto-rotate' })
      .describe('Automatically cycle through photos'),
    interval: z
      .number()
      .min(1000)
      .max(60000)
      .multipleOf(1000)
      .default(8000)
      .meta({ label: 'Interval (ms)' })
      .describe('Time between photo changes'),
  }),
  data: z.object({}),
});
