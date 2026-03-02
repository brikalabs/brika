/**
 * Forecast weather brick — client-side rendered.
 *
 * Displays a multi-day weather forecast with highs, lows, and condition icons.
 * Responsive: grid layout when wide, list layout when narrow.
 * Data is pushed from the plugin process via setBrickData().
 */

import { useBrickConfig, useBrickData, useBrickSize } from '@brika/sdk/brick-views';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { MapPin } from 'lucide-react';
import {
  CityError,
  formatTempWithUnit,
  LoadingSpinner,
  resolveCity,
  resolveUnit,
  WeatherIcon,
} from './shared';

// ─── Types (inlined — can't import from plugin runtime code) ────────────────

interface ForecastDay {
  date: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  icon: string;
  color: string;
}

interface ForecastCityData {
  days: ForecastDay[];
  gradient: string;
  city: string;
}

interface ForecastWeatherData {
  defaultCity: string;
  unit: string;
  cities: Record<string, ForecastCityData>;
  cityErrors?: Record<string, string>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function dayLabel(dateStr: string, t: (key: string) => string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === today.getTime()) return t('days.today');
  if (date.getTime() === tomorrow.getTime()) return t('days.tomorrow');
  return t(`days.${WEEKDAY_KEYS[date.getDay()]}`);
}

// ─── Day row (narrow list layout) ───────────────────────────────────────────

function DayRow({ day, unit }: Readonly<{ day: ForecastDay; unit: string }>) {
  const { t } = useLocale();
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-7 items-center justify-center rounded-full" style={{ backgroundColor: `${day.color}33` }}>
        <WeatherIcon name={day.icon} color={day.color} className="size-4" />
      </div>
      <span className="flex-1 truncate text-sm font-medium text-white">{dayLabel(day.date, t)}</span>
      <span className="font-bold text-white">{formatTempWithUnit(day.tempMax, unit)}</span>
      <span className="text-sm text-white/35">{formatTempWithUnit(day.tempMin, unit)}</span>
    </div>
  );
}

// ─── Day cell (wide grid layout) ────────────────────────────────────────────

function DayCell({ day, unit }: Readonly<{ day: ForecastDay; unit: string }>) {
  const { t } = useLocale();
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-[11px] font-semibold text-white/70">{dayLabel(day.date, t)}</span>
      <div className="flex size-8 items-center justify-center rounded-full" style={{ backgroundColor: `${day.color}33` }}>
        <WeatherIcon name={day.icon} color={day.color} className="size-5" />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-sm font-bold text-white">{formatTempWithUnit(day.tempMax, unit)}</span>
        <span className="text-[11px] text-white/35">{formatTempWithUnit(day.tempMin, unit)}</span>
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function WeatherForecast() {
  const data = useBrickData<ForecastWeatherData>();
  const config = useBrickConfig();
  const { width, height } = useBrickSize();
  const { t } = useLocale();

  if (!data) return <LoadingSpinner />;

  const cityKey = resolveCity(config, data.defaultCity);
  const cityData = data.cities[cityKey];

  if (!cityData) return <CityError error={data.cityErrors?.[cityKey]} />;

  const unit = resolveUnit(config, data.unit);
  const configDays = typeof config.days === 'number' ? config.days : 7;
  const useGrid = width >= 4;

  // Grid: cap days by width. List: cap by height.
  let maxVisible = width;
  if (!useGrid) {
    if (height >= 3) maxVisible = 7;
    else if (height >= 2) maxVisible = 5;
    else maxVisible = 3;
  }

  const visibleDays = cityData.days.slice(0, Math.min(configDays, maxVisible));

  return (
    <div
      className="flex h-full flex-col gap-2 rounded-lg p-4"
      style={{ background: cityData.gradient }}
    >
      {/* Header — location left, day count right */}
      <div className="flex items-center gap-1.5">
        <MapPin className="size-3.5 shrink-0 text-white/50" />
        <span className="truncate font-semibold text-white">{cityData.city}</span>
        <span className="ml-auto shrink-0 text-xs text-white/45">
          {t('ui.dayForecast', { count: visibleDays.length })}
        </span>
      </div>

      {/* Divider */}
      <div className="h-px bg-white/10" />

      {/* Forecast — grid when wide, list when narrow */}
      {useGrid ? (
        <div
          className="flex flex-1 items-center justify-around"
          style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleDays.length}, 1fr)`, gap: '0.75rem' }}
        >
          {visibleDays.map((day) => (
            <DayCell key={day.date} day={day} unit={unit} />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-between gap-1.5">
          {visibleDays.map((day) => (
            <DayRow key={day.date} day={day} unit={unit} />
          ))}
        </div>
      )}
    </div>
  );
}
