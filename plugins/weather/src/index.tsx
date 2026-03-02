import { getDeviceLocation, getPreferences, setBrickData } from '@brika/sdk';
import {
  log,
  onBrickConfigChange,
  onInit,
  onPreferencesChange,
  onStop,
} from '@brika/sdk/lifecycle';
import { getConditionColor, getGradient, getWeatherMeta } from './utils';
import { acquirePolling, useWeatherMap } from './weather-store';

// All bricks are client-rendered — no server-side brick exports.

// ─── Preferences ────────────────────────────────────────────────────────────

interface WeatherPrefs {
  city?: string;
  unit?: string;
}

function getUnit(prefs?: WeatherPrefs): string {
  return (prefs ?? getPreferences<WeatherPrefs>()).unit ?? 'celsius';
}

const FALLBACK_CITY = 'Zurich';

let defaultCity = FALLBACK_CITY;
let currentUnit = getUnit();

// ─── Multi-city polling ─────────────────────────────────────────────────────

const cityReleases = new Map<string, () => void>();

function ensurePolling(city: string): void {
  if (!city || cityReleases.has(city)) return;
  cityReleases.set(city, acquirePolling(city));
}

function stopPolling(city: string): void {
  const release = cityReleases.get(city);
  if (release) {
    release();
    cityReleases.delete(city);
  }
}

function setDefaultCity(city: string): void {
  if (!city || city === defaultCity) return;
  stopPolling(defaultCity);
  defaultCity = city;
  ensurePolling(defaultCity);
  pushBrickData();
}

// ─── Push brick data to client-side bricks ──────────────────────────────────

function pushBrickData() {
  const weatherMap = useWeatherMap.get();

  // Build per-city formatted data for each brick type
  const compactCities: Record<string, unknown> = {};
  const currentCities: Record<string, unknown> = {};
  const forecastCities: Record<string, unknown> = {};
  const cityErrors: Record<string, string> = {};

  for (const [city, weather] of Object.entries(weatherMap)) {
    // Surface error states so the client can show feedback instead of a
    // permanent loader when a city name is invalid or the API is down.
    if (weather?.error) {
      cityErrors[city] = weather.error;
    }

    if (!weather?.current || !weather.location) continue;

    const code = weather.current.weatherCode;
    const meta = getWeatherMeta(code);
    const gradient = getGradient(code);
    const color = getConditionColor(code);
    const conditionKey = meta.labelKey.replace('conditions.', '');

    compactCities[city] = {
      temperature: weather.current.temperature,
      apparentTemperature: weather.current.apparentTemperature,
      conditionKey,
      city: weather.location.name,
      gradient,
    };

    currentCities[city] = {
      temperature: weather.current.temperature,
      apparentTemperature: weather.current.apparentTemperature,
      humidity: weather.current.humidity,
      weatherCode: code,
      windSpeed: weather.current.windSpeed,
      windDirection: weather.current.windDirection,
      pressure: weather.current.pressure,
      conditionKey,
      icon: meta.icon,
      gradient,
      color,
      city: weather.location.name,
      lastUpdated: weather.lastUpdated,
    };

    forecastCities[city] = {
      days: weather.daily.map((day) => {
        const dayMeta = getWeatherMeta(day.weatherCode);
        return {
          date: day.date,
          weatherCode: day.weatherCode,
          tempMax: day.tempMax,
          tempMin: day.tempMin,
          icon: dayMeta.icon,
          color: getConditionColor(day.weatherCode),
        };
      }),
      gradient,
      city: weather.location.name,
    };
  }

  const shared = { defaultCity, unit: currentUnit, cityErrors };
  setBrickData('compact', { ...shared, cities: compactCities });
  setBrickData('current', { ...shared, cities: currentCities });
  setBrickData('forecast', { ...shared, cities: forecastCities });
}

// Subscribe to weather store changes and push data to all client bricks
useWeatherMap.subscribe(() => {
  pushBrickData();
});

// ─── Start polling immediately with fallback city ───────────────────────────

ensurePolling(defaultCity);

// ─── Brick config changes (per-instance city) ──────────────────────────────

/** Tracks which city each brick instance is currently polling. */
const instanceCities = new Map<string, string>();

onBrickConfigChange((instanceId, config) => {
  const city = typeof config.city === 'string' ? config.city.trim() : '';
  const previousCity = instanceCities.get(instanceId);

  if (city === previousCity) return;

  // Release the old city polling if no other instance uses it
  if (previousCity) {
    instanceCities.delete(instanceId);
    if (previousCity !== defaultCity && ![...instanceCities.values()].includes(previousCity)) {
      stopPolling(previousCity);
    }
  }

  if (city) {
    instanceCities.set(instanceId, city);
    ensurePolling(city);
  }
});

// ─── On init: refine default city from real preferences + hub location ──────

onInit(async () => {
  const prefs = getPreferences<WeatherPrefs>();
  const prefCity = prefs.city?.trim();
  currentUnit = getUnit(prefs);

  if (prefCity) {
    setDefaultCity(prefCity);
    return;
  }

  // No preference city — try hub location
  try {
    const location = await getDeviceLocation();
    if (location?.city) {
      log.info(`Auto-detected city from hub location: ${location.city}`);
      setDefaultCity(location.city);
    }
  } catch {
    // Location permission denied or unavailable — keep fallback
  }
});

// ─── Subsequent preference changes ──────────────────────────────────────────

onPreferencesChange<WeatherPrefs>((prefs) => {
  const newUnit = getUnit(prefs);
  const newCity = prefs.city?.trim() || '';

  if (newUnit !== currentUnit) {
    currentUnit = newUnit;
    pushBrickData();
  }

  if (newCity) {
    setDefaultCity(newCity);
  }
});

// ─── Lifecycle ──────────────────────────────────────────────────────────────

onStop(() => {
  for (const release of cityReleases.values()) {
    release();
  }
  cityReleases.clear();
  instanceCities.clear();
  log.info('Weather plugin stopping');
});

log.info('Weather plugin loaded');
