/**
 * Typed brick-data channels for the SIL electricity bricks. Declared once and
 * imported by both the plugin process (index.tsx, `.set(...)`) and the client
 * views (bricks/*.tsx, `.use()`). All four bricks render the same state.
 */

import { defineBrickData } from '@brika/sdk/brick-views';
import type { ElectricityState } from './types';

export const chartData = defineBrickData<ElectricityState>('chart');
export const summaryData = defineBrickData<ElectricityState>('summary');
export const liveData = defineBrickData<ElectricityState>('live');
export const costData = defineBrickData<ElectricityState>('cost');
