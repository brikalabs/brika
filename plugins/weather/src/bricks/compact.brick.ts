/**
 * Compact temperature brick descriptor: id, display meta, typed per-instance
 * config, and the data channel shared with the plugin process. Imported by
 * index.tsx (`data.set`) and compact.tsx (`data.use`); the payload type lives
 * with the view that renders it.
 */

import { z } from '@brika/sdk';
import { defineBrick } from '@brika/sdk/brick';
import type { CompactWeatherData } from './compact';

export const compactBrick = defineBrick({
  id: 'compact',
  meta: {
    name: 'Temperature',
    description: 'Compact temperature and condition display',
    category: 'info',
    icon: 'thermometer',
    color: '#ef4444',
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
  data: z.custom<CompactWeatherData>(),
});
