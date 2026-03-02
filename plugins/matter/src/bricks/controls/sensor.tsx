/**
 * Sensor controls — grid of stat cards for sensor readings.
 */

import { Activity } from 'lucide-react';
import { StatCard } from '../components';
import { getDeviceTheme } from '../theme';
import type { DeviceState } from '../types';

export function SensorControls({ device }: Readonly<{ device: DeviceState }>) {
  const entries = Object.entries(device.state);
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
          label={key}
          value={String(val)}
          accentColor={theme.accentColor}
        />
      ))}
    </div>
  );
}
