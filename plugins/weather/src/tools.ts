/**
 * Weather Plugin Tools
 *
 * Hub-wide, AI-discoverable capability: one `get-weather` tool that resolves a
 * city name and returns the current conditions plus the daily forecast, with
 * weather codes already translated to human-readable conditions. This is what
 * lets an agent answer "do I need an umbrella tomorrow?" or drive a "close the
 * blinds when it gets hot" workflow without any weather knowledge hard-coded.
 *
 * It reuses the same Open-Meteo client as the bricks (api.ts), so all weather
 * data flows through one code path.
 */

import { defineTool, z } from '@brika/sdk';
import { fetchWeather, geocodeCity } from './api';
import { getWeatherMeta } from './utils';

defineTool(
  {
    id: 'get-weather',
    description:
      'Current weather and daily forecast for a city: temperature, feels-like, humidity, wind, condition, and per-day min/max/precipitation for up to 7 days. Use this for any "what is the weather" or "will it rain" question.',
    icon: 'cloud-sun',
    color: '#0ea5e9',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name, e.g. "Lausanne"' },
        days: { type: 'number', description: 'Forecast days to include, 1-7 (default 3)' },
      },
      required: ['city'],
    },
  },
  async (args) => {
    const parsed = z
      .object({ city: z.string().min(1), days: z.number().int().min(1).max(7).default(3) })
      .parse(args);

    const location = await geocodeCity(parsed.city);
    if (!location) {
      return { ok: false, error: `Unknown city: ${parsed.city}` };
    }
    const weather = await fetchWeather(location.latitude, location.longitude);
    if (!weather) {
      return { ok: false, error: 'Weather service unavailable' };
    }

    return {
      ok: true,
      location: { name: location.name, country: location.country },
      current: {
        condition: getWeatherMeta(weather.current.weatherCode).condition,
        temperatureC: weather.current.temperature,
        feelsLikeC: weather.current.apparentTemperature,
        humidityPercent: weather.current.humidity,
        windKmh: weather.current.windSpeed,
      },
      daily: weather.daily.slice(0, parsed.days).map((day) => ({
        date: day.date,
        condition: getWeatherMeta(day.weatherCode).condition,
        minC: day.tempMin,
        maxC: day.tempMax,
        precipitationMm: day.precipitationSum,
      })),
    };
  }
);
