/**
 * Timers Dashboard brick descriptor: id + meta + config + data, in one
 * react-free module shared by the view (`.use()`, config) and the plugin
 * process (`.set()`). `brika build` reads it for the manifest.
 */

import { z } from '@brika/sdk';
import { defineBrick } from '@brika/sdk/brick';

export const timersDashboard = defineBrick({
  id: 'timers-dashboard',
  meta: {
    name: 'Timers Dashboard',
    description: 'Overview of active timers and countdowns',
    category: 'monitoring',
    icon: 'timer',
    color: '#22c55e',
  },
  config: z.object({
    refreshInterval: z
      .number()
      .min(1000)
      .max(30000)
      .multipleOf(1000)
      .default(5000)
      .meta({ label: 'Refresh Interval (ms)' })
      .describe('How often to update uptime'),
  }),
  data: z.object({
    blockCount: z.number(),
    sparkCount: z.number(),
    startedAt: z.number(),
  }),
});
