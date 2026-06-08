/**
 * Monthly cost brick descriptor: id, display meta, and the data channel shared
 * with the plugin process. No per-instance config. Imported by index.tsx
 * (`data.set`) and cost.tsx (`data.use`).
 */

import { z } from '@brika/sdk';
import { defineBrick } from '@brika/sdk/brick';
import type { ElectricityState } from '../types';

export const costBrick = defineBrick({
  id: 'cost',
  meta: {
    name: 'Monthly Cost',
    description: 'Estimated electricity cost for the current month based on your kWh price',
    category: 'info',
    icon: 'banknote',
    color: '#8b5cf6',
  },
  config: z.object({}),
  data: z.custom<ElectricityState>(),
});
