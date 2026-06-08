/**
 * Live consumption brick descriptor: id, display meta, and the data channel
 * shared with the plugin process. No per-instance config. Imported by index.tsx
 * (`data.set`) and live.tsx (`data.use`).
 */

import { z } from '@brika/sdk';
import { defineBrick } from '@brika/sdk/brick';
import type { ElectricityState } from '../types';

export const liveBrick = defineBrick({
  id: 'live',
  meta: {
    name: 'Live Consumption',
    description: 'Latest 15-minute reading with a mini area chart of recent activity',
    category: 'info',
    icon: 'activity',
    color: '#10b981',
  },
  config: z.object({}),
  data: z.custom<ElectricityState>(),
});
