/**
 * Current weather brick descriptor: id, display meta, typed per-instance config,
 * and the data channel shared with the plugin process. Imported by index.tsx
 * (`data.set`) and current.tsx (`data.use`); the payload type lives with the
 * view that renders it.
 */

import { z } from '@brika/sdk';
import { defineBrick } from '@brika/sdk/brick';
import type { CurrentWeatherData } from './current';

export const currentBrick = defineBrick({
  id: 'current',
  meta: {
    name: 'Current Weather',
    description: 'Live weather conditions with beautiful background imagery',
    category: 'info',
    icon: 'cloud-sun',
    color: '#f59e0b',
  },
  config: z.object({
    city: z.string().optional().meta({
      label: 'City',
      description: 'City name (leave empty for auto-detect or plugin default)',
    }),
    unit: z
      .enum(['default', 'celsius', 'fahrenheit'])
      .default('default')
      .meta({ label: 'Temperature Unit' }),
  }),
  data: z.custom<CurrentWeatherData>(),
});
