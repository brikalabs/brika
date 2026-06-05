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

import { defineSharedStore, log } from '@brika/sdk';
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

const POLL_MS = 10 * 60 * 1000; // 10 minutes steady-state cadence

// Fast-retry backoff after a failed poll: ~1s, 2s, 4s, 8s, 16s, capped at 30s.
// Independent of the steady POLL_MS interval so a refresh recovers in seconds,
// not minutes, while a healthy city never retries faster than 10 minutes.
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;

interface CityEntry {
  refCount: number;
  timer: ReturnType<typeof setInterval> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  retryAttempt: number;
  cachedLocation: GeoLocation | null;
}

const cities = new Map<string, CityEntry>();

function getEntry(city: string): CityEntry {
  let entry = cities.get(city);
  if (!entry) {
    entry = {
      refCount: 0,
      timer: null,
      retryTimer: null,
      retryAttempt: 0,
      cachedLocation: null,
    };
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

/** Cancel any pending fast-retry without resetting the backoff counter. */
function clearRetry(entry: CityEntry): void {
  if (entry.retryTimer) {
    clearTimeout(entry.retryTimer);
    entry.retryTimer = null;
  }
}

/**
 * Schedule a single fast retry with exponential backoff. Cancels any pending
 * retry first so retry chains never stack per city, and is a no-op once the
 * city has no subscribers (released/unmounted).
 */
function scheduleRetry(city: string): void {
  const entry = cities.get(city);
  if (!entry || entry.refCount === 0) {
    return;
  }

  clearRetry(entry);

  const delay = Math.min(RETRY_BASE_MS * 2 ** entry.retryAttempt, RETRY_MAX_MS);
  entry.retryAttempt++;

  log.info(`Weather retry for "${city}" scheduled in ${delay}ms (attempt ${entry.retryAttempt})`);
  entry.retryTimer = setTimeout(() => {
    entry.retryTimer = null;
    pollCity(city);
  }, delay);
}

/** Poll once. On success reset the backoff; on any failure schedule a fast retry. */
async function pollCity(city: string): Promise<void> {
  const entry = cities.get(city);
  if (!entry) {
    return;
  }

  log.debug(`Weather poll for "${city}" starting`);
  try {
    let location = entry.cachedLocation;
    if (!location) {
      updateCity(city, { loading: true, error: null });
      location = await geocodeCity(city);
      if (!location) {
        log.warn(`Weather geocode for "${city}" found no match`);
        updateCity(city, { loading: false, error: `City not found: ${city}` });
        scheduleRetry(city);
        return;
      }
      entry.cachedLocation = location;
    }

    const data = await fetchWeather(location.latitude, location.longitude);
    if (!data) {
      log.warn(`Weather fetch for "${city}" returned no data`);
      updateCity(city, { loading: false, error: 'Failed to fetch weather data' });
      scheduleRetry(city);
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

    // Success: drop any pending retry and resume the steady 10-minute cadence.
    clearRetry(entry);
    entry.retryAttempt = 0;
    log.debug(`Weather poll for "${city}" OK`);
  } catch (err) {
    log.warn(
      `Weather poll for "${city}" failed: ${err instanceof Error ? err.message : String(err)}`
    );
    updateCity(city, { loading: false, error: 'Network error' });
    scheduleRetry(city);
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
    entry.retryAttempt = 0;
    pollCity(city);
    entry.timer = setInterval(() => pollCity(city), POLL_MS);
  }

  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    entry.refCount--;
    if (entry.refCount === 0) {
      if (entry.timer) {
        clearInterval(entry.timer);
        entry.timer = null;
      }
      // Cancel any in-flight fast retry so no timer leaks past the last unmount.
      clearRetry(entry);
      entry.retryAttempt = 0;
    }
  };
}
