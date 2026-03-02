/**
 * Compact weather brick — client-side rendered.
 *
 * This brick runs in the browser as a real React component.
 * Weather data is pushed from the plugin process via setBrickData().
 * Imports are resolved by the bridge (globalThis.__brika) at build time.
 */

import { useBrickConfig, useBrickData } from '@brika/sdk/brick-views';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { MapPin, Thermometer } from 'lucide-react';
import { CityError, formatTempWithUnit, LoadingSpinner, resolveCity, resolveUnit } from './shared';

// ─── Types (inlined — can't import from plugin runtime code) ────────────────

interface CompactCityData {
  temperature: number;
  apparentTemperature: number;
  conditionKey: string;
  city: string;
  gradient: string;
}

interface CompactWeatherData {
  defaultCity: string;
  unit: string;
  cities: Record<string, CompactCityData>;
  cityErrors?: Record<string, string>;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CompactWeather() {
  const data = useBrickData<CompactWeatherData>();
  const config = useBrickConfig();
  const { t } = useLocale();

  if (!data) return <LoadingSpinner />;

  const cityKey = resolveCity(config, data.defaultCity);
  const cityData = data.cities[cityKey];

  if (!cityData) return <CityError error={data.cityErrors?.[cityKey]} />;

  const unit = resolveUnit(config, data.unit);

  return (
    <div
      className="flex h-full flex-col justify-center gap-2 rounded-lg p-3"
      style={{ background: cityData.gradient }}
    >
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold text-white">{formatTempWithUnit(cityData.temperature, unit)}</span>
        <span className="text-sm text-white/70">{t(`conditions.${cityData.conditionKey}`)}</span>
      </div>
      <div className="flex items-center gap-1 text-xs text-white/60">
        <MapPin className="size-3" />
        <span className="truncate">{cityData.city}</span>
      </div>
      <div className="flex items-center gap-1 text-xs text-white/50">
        <Thermometer className="size-3" />
        <span>{t('stats.feelsLike')} {formatTempWithUnit(cityData.apparentTemperature, unit)}</span>
      </div>
    </div>
  );
}
