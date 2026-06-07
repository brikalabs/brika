/**
 * Forecast brick descriptor: id, display meta, typed per-instance config, and the
 * data channel shared with the plugin process. Imported by index.tsx
 * (`data.set`) and forecast.tsx (`data.use`); the payload type lives with the
 * view that renders it.
 */

import { z } from '@brika/sdk';
import { defineBrick } from '@brika/sdk/brick';
import type { ForecastWeatherData } from './forecast';

export const forecastBrick = defineBrick({
  id: 'forecast',
  meta: {
    name: 'Weather Forecast',
    description: 'Multi-day weather forecast with highs, lows, and conditions',
    category: 'info',
    icon: 'calendar-days',
    color: '#3b82f6',
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
    days: z
      .number()
      .min(1)
      .max(7)
      .multipleOf(1)
      .default(7)
      .meta({ label: 'Forecast Days', description: 'Number of days to show (1-7)' }),
  }),
  data: z.custom<ForecastWeatherData>(),
});
