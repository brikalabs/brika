/**
 * Shared weather store — city-keyed, one polling loop per city.
 *
 * Built on `defineSharedStore` from the SDK. Multiple brick instances
 * can show different cities; polling is reference-counted per city.
 *
 * @example
 * ```tsx
 * // In a brick:
 * const weather = useWeatherMap()['Zurich'] ?? DEFAULT_WEATHER;
 * useEffect(() => acquirePolling('Zurich'), []);
 * ```
 */

import { log } from '@brika/sdk';
import { defineSharedStore } from '@brika/sdk/bricks';
import { fetchWeather, geocodeCity } from './api';
import type { GeoLocation, WeatherState } from './types';

// ─── Default state for a city with no data yet ──────────────────────────────

export const DEFAULT_WEATHER: WeatherState = {
  location: null,
  current: null,
  daily: [],
  hourly: [],
  lastUpdated: null,
  loading: false,
  error: null,
};

// ─── Store: city → weather data ──────────────────────────────────────────────

export const useWeatherMap = defineSharedStore<Record<string, WeatherState>>({});

// ─── Per-city polling ────────────────────────────────────────────────────────

const POLL_MS = 10 * 60 * 1000; // 10 minutes

interface CityEntry {
  refCount: number;
  timer: ReturnType<typeof setInterval> | null;
  cachedLocation: GeoLocation | null;
}

const cities = new Map<string, CityEntry>();

function getEntry(city: string): CityEntry {
  let entry = cities.get(city);
  if (!entry) {
    entry = { refCount: 0, timer: null, cachedLocation: null };
    cities.set(city, entry);
  }
  return entry;
}

function updateCity(city: string, patch: Partial<WeatherState>): void {
  useWeatherMap.set((prev) => ({
    ...prev,
    [city]: { ...(prev[city] ?? DEFAULT_WEATHER), ...patch },
  }));
}

async function pollCity(city: string): Promise<void> {
  const entry = cities.get(city);
  if (!entry) return;

  try {
    let location = entry.cachedLocation;
    if (!location) {
      updateCity(city, { loading: true, error: null });
      location = await geocodeCity(city);
      if (!location) {
        updateCity(city, { loading: false, error: `City not found: ${city}` });
        return;
      }
      entry.cachedLocation = location;
    }

    const data = await fetchWeather(location.latitude, location.longitude);
    if (!data) {
      updateCity(city, { loading: false, error: 'Failed to fetch weather data' });
      return;
    }

    useWeatherMap.set((prev) => ({
      ...prev,
      [city]: {
        location,
        current: data.current,
        daily: data.daily,
        hourly: data.hourly,
        lastUpdated: Date.now(),
        loading: false,
        error: null,
      },
    }));
  } catch (err) {
    log.error(`Weather poll for "${city}" failed: ${err instanceof Error ? err.message : String(err)}`);
    updateCity(city, { loading: false, error: 'Network error' });
  }
}

/**
 * Acquire polling for a specific city.
 * Starts polling on first subscriber, stops on last.
 * Returns a release function to call on unmount.
 */
export function acquirePolling(city: string): () => void {
  const entry = getEntry(city);
  entry.refCount++;

  if (entry.refCount === 1) {
    pollCity(city);
    entry.timer = setInterval(() => pollCity(city), POLL_MS);
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    entry.refCount--;
    if (entry.refCount === 0 && entry.timer) {
      clearInterval(entry.timer);
      entry.timer = null;
    }
  };
}
