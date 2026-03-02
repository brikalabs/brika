/**
 * Shared weather brick utilities — temperature formatting, icon map,
 * city resolution, and loading/error states.
 */

import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudRainWind,
  CloudSun,
  Loader2,
  MapPin,
  Snowflake,
  Sun,
} from 'lucide-react';
import type { ComponentType } from 'react';

// ─── Temperature helpers ──────────────────────────────────────────────────────

export function formatTemp(celsius: number, unit: string): string {
  if (unit === 'fahrenheit') return `${Math.round(celsius * 9 / 5 + 32)}`;
  return `${Math.round(celsius)}`;
}

export function tempUnit(unit: string): string {
  return unit === 'fahrenheit' ? '\u00b0F' : '\u00b0C';
}

export function formatTempWithUnit(celsius: number, unit: string): string {
  return `${formatTemp(celsius, unit)}${tempUnit(unit)}`;
}

// ─── Icon map ─────────────────────────────────────────────────────────────────

export const ICON_MAP: Record<string, ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  'sun': Sun,
  'cloud-sun': CloudSun,
  'cloud': Cloud,
  'cloud-fog': CloudFog,
  'cloud-drizzle': CloudDrizzle,
  'cloud-rain': CloudRain,
  'snowflake': Snowflake,
  'cloud-rain-wind': CloudRainWind,
  'cloud-lightning': CloudLightning,
};

export function WeatherIcon({ name, className, color }: Readonly<{ name: string; className?: string; color?: string }>) {
  const IconComponent = ICON_MAP[name] ?? Cloud;
  return <IconComponent className={className} style={color ? { color } : undefined} />;
}

// ─── City + unit resolution ───────────────────────────────────────────────────

export function resolveCity(config: Record<string, unknown>, defaultCity: string): string {
  const raw = typeof config.city === 'string' ? config.city.trim() : '';
  return raw || defaultCity;
}

export function resolveUnit(config: Record<string, unknown>, dataUnit: string): string {
  const raw = typeof config.unit === 'string' ? config.unit : '';
  return raw && raw !== 'default' ? raw : dataUnit;
}

// ─── Loading / error states ──────────────────────────────────────────────────

export function LoadingSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-5 animate-spin text-white/50" />
    </div>
  );
}

export function CityError({ error }: Readonly<{ error?: string }>) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
      {error ? (
        <>
          <MapPin className="size-5 text-white/40" />
          <span className="text-sm text-white/60">{error}</span>
        </>
      ) : (
        <Loader2 className="size-5 animate-spin text-white/50" />
      )}
    </div>
  );
}
