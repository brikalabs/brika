/**
 * Matter devices overview brick descriptor: id, display meta, and the data
 * channel shared with the plugin process. Imported by index.tsx (`data.set`)
 * and devices.tsx (`data.use`); the payload type lives in ./types.
 */

import { z } from '@brika/sdk';
import { defineBrick } from '@brika/sdk/brick';
import type { DevicesData } from './types';

export const devicesBrick = defineBrick({
  id: 'devices',
  meta: {
    name: 'Matter Devices',
    description: 'View and manage Matter devices on your network',
    category: 'monitoring',
    icon: 'cpu',
    color: '#6366f1',
  },
  config: z.object({}),
  data: z.custom<DevicesData>(),
});
