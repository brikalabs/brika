import type { CurrentWeather, DailyForecast, GeoLocation, HourlyForecast } from './types';

const GEO_BASE = 'https://geocoding-api.open-meteo.com/v1';
const WEATHER_BASE = 'https://api.open-meteo.com/v1';

// ─── Geocoding ─────────────────────────────────────────────────────────────

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  timezone: string;
}

export async function geocodeCity(name: string): Promise<GeoLocation | null> {
  const url = `${GEO_BASE}/search?name=${encodeURIComponent(name)}&count=1&language=en`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = (await res.json()) as { results?: GeoResult[] };
  const first = data.results?.[0];
  if (!first) return null;

  return {
    name: first.name,
    latitude: first.latitude,
    longitude: first.longitude,
    country: first.country,
    timezone: first.timezone,
  };
}

// ─── Weather Data (single request for current + hourly + daily) ────────────

interface ForecastResponse {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    pressure_msl: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation_probability: number[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    wind_speed_10m_max: number[];
  };
}

export interface WeatherData {
  current: CurrentWeather;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
}

export async function fetchWeather(
  latitude: number,
  longitude: number,
): Promise<WeatherData | null> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl',
    hourly: 'temperature_2m,weather_code,precipitation_probability',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
    timezone: 'auto',
    forecast_days: '7',
  });

  const res = await fetch(`${WEATHER_BASE}/forecast?${params}`);
  if (!res.ok) return null;

  const data = (await res.json()) as ForecastResponse;

  const current: CurrentWeather = {
    temperature: data.current.temperature_2m,
    apparentTemperature: data.current.apparent_temperature,
    humidity: data.current.relative_humidity_2m,
    weatherCode: data.current.weather_code,
    windSpeed: data.current.wind_speed_10m,
    windDirection: data.current.wind_direction_10m,
    pressure: data.current.pressure_msl,
  };

  const hourly: HourlyForecast[] = data.hourly.time.map((time, i) => ({
    time,
    temperature: data.hourly.temperature_2m[i],
    weatherCode: data.hourly.weather_code[i],
    precipitationProbability: data.hourly.precipitation_probability[i],
  }));

  const daily: DailyForecast[] = data.daily.time.map((date, i) => ({
    date,
    weatherCode: data.daily.weather_code[i],
    tempMax: data.daily.temperature_2m_max[i],
    tempMin: data.daily.temperature_2m_min[i],
    precipitationSum: data.daily.precipitation_sum[i],
    windSpeedMax: data.daily.wind_speed_10m_max[i],
  }));

  return { current, hourly, daily };
}
