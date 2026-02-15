/**
 * useWeather — unified hook for weather brick instances.
 *
 * Handles city resolution (per-instance → plugin-level → auto-detect),
 * unit resolution (per-instance → plugin-level → celsius), polling
 * lifecycle, and store subscription. All in one call.
 *
 * @example
 * ```tsx
 * const { weather, city, unit } = useWeather();
 * // weather.current?.temperature, weather.loading, weather.error
 * ```
 */

import { getDeviceLocation } from '@brika/sdk';
import {
  useEffect,
  usePluginPreference,
  usePreference,
  useState,
} from '@brika/sdk/bricks/core';
import type { WeatherState } from './types';
import { acquirePolling, DEFAULT_WEATHER, useWeatherMap } from './weather-store';

interface UseWeatherResult {
  /** Weather data for the resolved city. */
  weather: WeatherState;
  /** The resolved city name being displayed. */
  city: string;
  /** The resolved temperature unit ('celsius' | 'fahrenheit'). */
  unit: string;
}

/**
 * Unified weather hook.
 *
 * Resolution order for **city**: brick config → plugin preference → auto-detect → "Zurich"
 * Resolution order for **unit**: brick config → plugin preference → "celsius"
 */
export function useWeather(): UseWeatherResult {
  // ─── City resolution ──────────────────────────────────────────────
  const [brickCity] = usePreference<string>('city', '');
  const pluginCity = usePluginPreference<string>('city', '');
  const [autoCity, setAutoCity] = useState('');

  const configuredCity = brickCity || pluginCity;

  // Auto-detect location when no city is configured
  useEffect(() => {
    if (configuredCity) return;
    getDeviceLocation().then((loc) => {
      if (loc?.city) setAutoCity(loc.city);
    });
  }, [configuredCity]);

  const resolvedCity = configuredCity || autoCity || 'Zurich';

  // ─── Unit resolution ──────────────────────────────────────────────
  const [brickUnit] = usePreference<string>('unit', 'default');
  const pluginUnit = usePluginPreference<string>('unit', 'celsius');
  const unit = brickUnit && brickUnit !== 'default' ? brickUnit : pluginUnit;

  // ─── Polling lifecycle ────────────────────────────────────────────
  useEffect(() => acquirePolling(resolvedCity), [resolvedCity]);

  // ─── Store subscription ───────────────────────────────────────────
  const weatherMap = useWeatherMap();
  const weather = weatherMap[resolvedCity] ?? DEFAULT_WEATHER;

  return { weather, city: resolvedCity, unit };
}
