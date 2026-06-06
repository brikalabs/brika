/**
 * Typed brick-data channels for the weather bricks. Declared once and imported
 * by both the plugin process (index.tsx, `.set(...)`) and the client views
 * (bricks/*.tsx, `.use()`). The per-brick payload shapes live with the brick
 * that renders them; the imports here are type-only (erased at runtime).
 */

import { defineBrickData } from '@brika/sdk/brick-views';
import type { CompactWeatherData } from './bricks/compact';
import type { CurrentWeatherData } from './bricks/current';
import type { ForecastWeatherData } from './bricks/forecast';

export const compactData = defineBrickData<CompactWeatherData>('compact');
export const currentData = defineBrickData<CurrentWeatherData>('current');
export const forecastData = defineBrickData<ForecastWeatherData>('forecast');
