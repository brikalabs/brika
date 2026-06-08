/**
 * Monthly summary brick descriptor: id, display meta, and the data channel
 * shared with the plugin process. No per-instance config. Imported by index.tsx
 * (`data.set`) and summary.tsx (`data.use`).
 */

import { z } from '@brika/sdk';
import { defineBrick } from '@brika/sdk/brick';
import type { ElectricityState } from '../types';

export const summaryBrick = defineBrick({
  id: 'summary',
  meta: {
    name: 'Monthly Summary',
    description: 'Current month consumption with trend vs previous month',
    category: 'info',
    icon: 'zap',
    color: '#f59e0b',
  },
  config: z.object({}),
  data: z.custom<ElectricityState>(),
});
