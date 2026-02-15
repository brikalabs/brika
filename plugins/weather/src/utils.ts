// ─── WMO Weather Codes ─────────────────────────────────────────────────────

export type WeatherCondition =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'showers'
  | 'thunderstorm';

export interface WeatherMeta {
  condition: WeatherCondition;
  /** i18n key under `conditions.*` */
  labelKey: string;
  icon: string;
}

const WMO_MAP: Record<number, WeatherMeta> = {
  0:  { condition: 'clear',          labelKey: 'conditions.clearSky',             icon: 'sun' },
  1:  { condition: 'partly-cloudy',  labelKey: 'conditions.mainlyClear',          icon: 'cloud-sun' },
  2:  { condition: 'partly-cloudy',  labelKey: 'conditions.partlyCloudy',         icon: 'cloud-sun' },
  3:  { condition: 'cloudy',         labelKey: 'conditions.overcast',             icon: 'cloud' },
  45: { condition: 'fog',            labelKey: 'conditions.fog',                  icon: 'cloud-fog' },
  48: { condition: 'fog',            labelKey: 'conditions.rimeFog',              icon: 'cloud-fog' },
  51: { condition: 'drizzle',        labelKey: 'conditions.lightDrizzle',         icon: 'cloud-drizzle' },
  53: { condition: 'drizzle',        labelKey: 'conditions.drizzle',              icon: 'cloud-drizzle' },
  55: { condition: 'drizzle',        labelKey: 'conditions.denseDrizzle',         icon: 'cloud-drizzle' },
  56: { condition: 'drizzle',        labelKey: 'conditions.freezingDrizzle',      icon: 'cloud-drizzle' },
  57: { condition: 'drizzle',        labelKey: 'conditions.heavyFreezingDrizzle', icon: 'cloud-drizzle' },
  61: { condition: 'rain',           labelKey: 'conditions.lightRain',            icon: 'cloud-rain' },
  63: { condition: 'rain',           labelKey: 'conditions.rain',                 icon: 'cloud-rain' },
  65: { condition: 'rain',           labelKey: 'conditions.heavyRain',            icon: 'cloud-rain' },
  66: { condition: 'rain',           labelKey: 'conditions.freezingRain',         icon: 'cloud-rain' },
  67: { condition: 'rain',           labelKey: 'conditions.heavyFreezingRain',    icon: 'cloud-rain' },
  71: { condition: 'snow',           labelKey: 'conditions.lightSnow',            icon: 'snowflake' },
  73: { condition: 'snow',           labelKey: 'conditions.snow',                 icon: 'snowflake' },
  75: { condition: 'snow',           labelKey: 'conditions.heavySnow',            icon: 'snowflake' },
  77: { condition: 'snow',           labelKey: 'conditions.snowGrains',           icon: 'snowflake' },
  80: { condition: 'showers',        labelKey: 'conditions.lightShowers',         icon: 'cloud-rain-wind' },
  81: { condition: 'showers',        labelKey: 'conditions.showers',              icon: 'cloud-rain-wind' },
  82: { condition: 'showers',        labelKey: 'conditions.heavyShowers',         icon: 'cloud-rain-wind' },
  85: { condition: 'snow',           labelKey: 'conditions.snowShowers',          icon: 'snowflake' },
  86: { condition: 'snow',           labelKey: 'conditions.heavySnowShowers',     icon: 'snowflake' },
  95: { condition: 'thunderstorm',   labelKey: 'conditions.thunderstorm',         icon: 'cloud-lightning' },
  96: { condition: 'thunderstorm',   labelKey: 'conditions.thunderstormHail',     icon: 'cloud-lightning' },
  99: { condition: 'thunderstorm',   labelKey: 'conditions.severeThunderstorm',   icon: 'cloud-lightning' },
};

const FALLBACK: WeatherMeta = { condition: 'cloudy', labelKey: 'conditions.unknown', icon: 'cloud' };

export function getWeatherMeta(code: number): WeatherMeta {
  return WMO_MAP[code] ?? FALLBACK;
}

// ─── Gradient Backgrounds ───────────────────────────────────────────────────
// All gradients dark enough for white text (WCAG AA on lightest stop).

const CONDITION_GRADIENTS: Record<WeatherCondition, string> = {
  clear:           'linear-gradient(135deg, #1a56a0 0%, #2875c8 50%, #3d8fd4 100%)',
  'partly-cloudy': 'linear-gradient(135deg, #2a5078 0%, #3b6a96 50%, #4d80ab 100%)',
  cloudy:          'linear-gradient(135deg, #363d47 0%, #454e5b 50%, #545f6e 100%)',
  fog:             'linear-gradient(135deg, #3e4652 0%, #4f5966 50%, #5e6b78 100%)',
  drizzle:         'linear-gradient(135deg, #2a4c72 0%, #3a6490 50%, #4a7aaa 100%)',
  rain:            'linear-gradient(135deg, #1a3352 0%, #264a72 50%, #336190 100%)',
  snow:            'linear-gradient(135deg, #3a5a78 0%, #4d7396 50%, #608aab 100%)',
  showers:         'linear-gradient(135deg, #142a48 0%, #1e3f68 50%, #2a5588 100%)',
  thunderstorm:    'linear-gradient(135deg, #1a1530 0%, #2a2250 50%, #3a3070 100%)',
};

export function getGradient(code: number): string {
  const { condition } = getWeatherMeta(code);
  return CONDITION_GRADIENTS[condition];
}

// ─── Icon Accent Colors ─────────────────────────────────────────────────────

const CONDITION_COLORS: Record<WeatherCondition, string> = {
  clear: '#fbbf24',
  'partly-cloudy': '#fbbf24',
  cloudy: '#94a3b8',
  fog: '#cbd5e1',
  drizzle: '#7dd3fc',
  rain: '#60a5fa',
  snow: '#e0e7ff',
  showers: '#60a5fa',
  thunderstorm: '#c4b5fd',
};

export function getConditionColor(code: number): string {
  const { condition } = getWeatherMeta(code);
  return CONDITION_COLORS[condition];
}

// ─── Weather Visuals (meta + color + gradient in one lookup) ────────────────

export interface WeatherVisuals {
  meta: WeatherMeta;
  color: string;
  gradient: string;
}

/** Single lookup for all display properties of a weather code. */
export function getWeatherVisuals(code: number): WeatherVisuals {
  const meta = getWeatherMeta(code);
  return {
    meta,
    color: CONDITION_COLORS[meta.condition],
    gradient: CONDITION_GRADIENTS[meta.condition],
  };
}

// ─── Temperature Formatting ────────────────────────────────────────────────

export function formatTemp(celsius: number, unit: string): string {
  if (unit === 'fahrenheit') {
    return `${Math.round(celsius * 9 / 5 + 32)}`;
  }
  return `${Math.round(celsius)}`;
}

export function tempUnit(unit: string): string {
  return unit === 'fahrenheit' ? '\u00b0F' : '\u00b0C';
}

/** formatTemp + tempUnit combined — e.g. "23°C" or "72°F" */
export function formatTempWithUnit(celsius: number, unit: string): string {
  return `${formatTemp(celsius, unit)}${tempUnit(unit)}`;
}

// ─── Wind Direction ────────────────────────────────────────────────────────

export function windDirectionLabel(degrees: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
  const index = Math.round(degrees / 45) % 8;
  return dirs[index];
}

// ─── Day Name Formatting ───────────────────────────────────────────────────

import type { I18nRef } from '@brika/sdk/bricks/core';

export type TranslateFn = (key: string, params?: Record<string, string | number>) => I18nRef;

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function dayName(dateStr: string, t: TranslateFn): I18nRef {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === today.getTime()) return t('days.today');
  if (date.getTime() === tomorrow.getTime()) return t('days.tomorrow');
  return t(`days.${WEEKDAY_KEYS[date.getDay()]}`);
}
