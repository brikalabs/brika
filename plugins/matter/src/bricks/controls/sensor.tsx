/**
 * Sensor controls — grid of stat cards for sensor readings.
 */

import { Activity } from 'lucide-react';
import { StatCard } from '../_components';
import { getDeviceTheme } from '../theme';
import type { DeviceState } from '../types';

/** Friendly labels + units for the attribute keys the controller maps. */
const READINGS: Record<string, { label: string; format: (value: unknown) => string }> = {
  temperature: { label: 'Temperature', format: (v) => `${String(v)}°C` },
  humidity: { label: 'Humidity', format: (v) => `${String(v)}%` },
  battery: { label: 'Battery', format: (v) => `${String(v)}%` },
  illuminance: { label: 'Light level', format: (v) => `${String(v)} lx` },
  occupied: { label: 'Occupancy', format: (v) => (v ? 'Occupied' : 'Clear') },
  contact: { label: 'Contact', format: (v) => (v ? 'Closed' : 'Open') },
};

/** Internal keys that mean nothing to a person looking at a board. */
const HIDDEN_KEYS = new Set(['buttonPosition', 'buttons', 'colorMode', 'lockState']);

export function SensorControls({ device }: Readonly<{ device: DeviceState }>) {
  const entries = Object.entries(device.state).filter(
    ([key, value]) => !HIDDEN_KEYS.has(key) && value !== null && value !== undefined
  );
  const theme = getDeviceTheme('sensor');

  if (entries.length === 0) {
    return (
      <StatCard icon={Activity} label="Sensor" value="No data" accentColor={theme.accentColor} />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {entries.slice(0, 4).map(([key, val]) => {
        const reading = READINGS[key];
        return (
          <StatCard
            key={key}
            icon={Activity}
            label={reading?.label ?? key}
            value={reading ? reading.format(val) : String(val)}
            accentColor={theme.accentColor}
          />
        );
      })}
    </div>
  );
}
