/**
 * Sensor controls — grid of stat cards for sensor readings.
 *
 * Labels, units, and visibility come from the shared attribute registry
 * (attributes.ts): hidden internals never render, prioritized readings
 * (temperature, humidity, ...) come first.
 */

import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { Activity } from 'lucide-react';
import { ATTRIBUTE_BY_KEY, attributePriority, formatAttribute } from '../../attributes';
import { StatCard } from '../_components';
import { getDeviceTheme } from '../theme';
import type { DeviceState } from '../types';

/** Translated attribute label; unknown keys fall back to the raw state key. */
function attributeLabel(key: string, t: (k: string) => string): string {
  const meta = ATTRIBUTE_BY_KEY[key];
  return meta ? t(meta.labelKey) : key;
}

export function SensorControls({ device }: Readonly<{ device: DeviceState }>) {
  const { t } = useLocale();
  const entries = Object.entries(device.state)
    .filter(
      ([key, value]) =>
        ATTRIBUTE_BY_KEY[key]?.hidden !== true && value !== null && value !== undefined
    )
    .sort(([a], [b]) => attributePriority(a) - attributePriority(b));
  const theme = getDeviceTheme('sensor');

  if (entries.length === 0) {
    return (
      <StatCard icon={Activity} label="Sensor" value="No data" accentColor={theme.accentColor} />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {entries.slice(0, 4).map(([key, val]) => (
        <StatCard
          key={key}
          icon={Activity}
          label={attributeLabel(key, t)}
          value={formatAttribute(key, val, t)}
          accentColor={theme.accentColor}
        />
      ))}
    </div>
  );
}
