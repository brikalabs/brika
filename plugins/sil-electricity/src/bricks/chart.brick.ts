/**
 * Consumption chart brick descriptor: id, display meta, typed per-instance
 * config, and the data channel shared with the plugin process. Imported by
 * index.tsx (`data.set`) and chart.tsx (`data.use`).
 */

import { z } from '@brika/sdk';
import { defineBrick } from '@brika/sdk/brick';
import type { ElectricityState } from '../types';

export const chartBrick = defineBrick({
  id: 'chart',
  meta: {
    name: 'Consumption Chart',
    description: 'Configurable consumption chart by period and style',
    category: 'info',
    icon: 'bar-chart-2',
    color: '#3b82f6',
  },
  config: z.object({
    period: z.enum(['24h', '7d', '30d', '12m', '24m']).default('12m').meta({ label: 'Period' }),
    style: z.enum(['bar', 'area', 'line']).default('bar').meta({ label: 'Chart Style' }),
  }),
  data: z.custom<ElectricityState>(),
});
