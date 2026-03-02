/**
 * Current weather brick — client-side rendered.
 *
 * Displays live weather conditions with temperature, feels-like,
 * humidity, wind, pressure, and a gradient background matching the condition.
 * Data is pushed from the plugin process via setBrickData().
 */

import { useBrickConfig, useBrickData, useBrickSize } from '@brika/sdk/brick-views';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import {
  Droplets,
  Gauge,
  MapPin,
  Thermometer,
  Wind,
} from 'lucide-react';
import type { ComponentType } from 'react';
import {
  CityError,
  formatTemp,
  formatTempWithUnit,
  LoadingSpinner,
  resolveCity,
  resolveUnit,
  tempUnit,
  WeatherIcon,
} from './shared';

// ─── Types (inlined — can't import from plugin runtime code) ────────────────

interface CurrentCityData {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  weatherCode: number;
  windSpeed: number;
  windDirection: number;
  pressure: number;
  conditionKey: string;
  icon: string;
  gradient: string;
  color: string;
  city: string;
  lastUpdated: number | null;
}

interface CurrentWeatherData {
  defaultCity: string;
  unit: string;
  cities: Record<string, CurrentCityData>;
  cityErrors?: Record<string, string>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function windDirectionLabel(degrees: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
  const index = Math.round(degrees / 45) % 8;
  return dirs[index];
}

// ─── Stat row ────────────────────────────────────────────────────────────────

function WeatherStat({
  icon,
  label,
  value,
  suffix,
}: Readonly<{
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  suffix?: string;
}>) {
  const StatIcon = icon;
  return (
    <div className="flex flex-1 flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <StatIcon className="size-3 shrink-0 text-white/50" />
        <span className="truncate text-[10px] text-white/60">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-bold text-white">{value}</span>
        {suffix ? <span className="text-[10px] text-white/50">{suffix}</span> : null}
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CurrentWeather() {
  const data = useBrickData<CurrentWeatherData>();
  const config = useBrickConfig();
  const { width, height } = useBrickSize();
  const { t } = useLocale();

  if (!data) return <LoadingSpinner />;

  const cityKey = resolveCity(config, data.defaultCity);
  const d = data.cities[cityKey];

  if (!d) return <CityError error={data.cityErrors?.[cityKey]} />;

  const unit = resolveUnit(config, data.unit);
  const isCompact = width <= 2 && height <= 1;

  // ─── Compact layout ─────────────────────────────────────────────

  if (isCompact) {
    return (
      <div
        className="flex h-full flex-col justify-center gap-1.5 rounded-lg p-3"
        style={{ background: d.gradient }}
      >
        <div className="flex items-center gap-2">
          <WeatherIcon name={d.icon} className="size-5 text-white/80" />
          <span className="text-xl font-bold text-white">
            {formatTempWithUnit(d.temperature, unit)}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-white/60">
          <MapPin className="size-3 shrink-0" />
          <span className="truncate">{d.city}</span>
        </div>
      </div>
    );
  }

  // ─── Default layout ─────────────────────────────────────────────

  return (
    <div
      className="flex h-full flex-col gap-3 rounded-lg p-4"
      style={{ background: d.gradient }}
    >
      {/* Header: location + condition label */}
      <div className="flex items-center gap-1.5">
        <MapPin className="size-3.5 shrink-0 text-white/50" />
        <span className="truncate font-bold text-white">{d.city}</span>
        <span className="ml-auto shrink-0 text-xs text-white/60">{t(`conditions.${d.conditionKey}`)}</span>
      </div>

      {/* Main: icon + temp + feels like */}
      <div className="flex flex-1 items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-full" style={{ backgroundColor: `${d.color}33` }}>
          <WeatherIcon name={d.icon} className="size-7" color={d.color} />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-3xl font-bold leading-none text-white">
            {formatTempWithUnit(d.temperature, unit)}
          </span>
          <span className="text-xs text-white/60">
            {t('stats.feelsLike')} {formatTempWithUnit(d.apparentTemperature, unit)}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-white/12" />

      {/* Stats grid */}
      <div className="grid auto-cols-fr grid-flow-col gap-3">
        <WeatherStat
          icon={Thermometer}
          label={t('stats.feelsLike')}
          value={formatTemp(d.apparentTemperature, unit)}
          suffix={tempUnit(unit)}
        />
        <WeatherStat
          icon={Droplets}
          label={t('stats.humidity')}
          value={`${d.humidity}`}
          suffix="%"
        />
        <WeatherStat
          icon={Wind}
          label={t('stats.wind')}
          value={`${Math.round(d.windSpeed)}`}
          suffix={`km/h ${windDirectionLabel(d.windDirection)}`}
        />
        {width >= 3 ? (
          <WeatherStat
            icon={Gauge}
            label={t('stats.pressure')}
            value={`${Math.round(d.pressure)}`}
            suffix="hPa"
          />
        ) : null}
      </div>

      {/* Updated timestamp */}
      {d.lastUpdated ? (
        <span className="text-[10px] text-white/35">
          {t('ui.updated', { time: new Date(d.lastUpdated).toLocaleTimeString() })}
        </span>
      ) : null}
    </div>
  );
}
