// ─── Geocoding ─────────────────────────────────────────────────────────────

export interface GeoLocation {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  timezone: string;
}

// ─── Current Weather ───────────────────────────────────────────────────────

export interface CurrentWeather {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  weatherCode: number;
  windSpeed: number;
  windDirection: number;
  pressure: number;
}

// ─── Hourly Forecast ───────────────────────────────────────────────────────

export interface HourlyForecast {
  time: string;
  temperature: number;
  weatherCode: number;
  precipitationProbability: number;
}

// ─── Daily Forecast ────────────────────────────────────────────────────────

export interface DailyForecast {
  date: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipitationSum: number;
  windSpeedMax: number;
}

// ─── Shared Store State ────────────────────────────────────────────────────

export interface WeatherState {
  location: GeoLocation | null;
  current: CurrentWeather | null;
  daily: DailyForecast[];
  hourly: HourlyForecast[];
  lastUpdated: number | null;
  loading: boolean;
  error: string | null;
}
