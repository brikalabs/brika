/**
 * Device controls dispatcher — routes to the appropriate control component
 * based on device type.
 */

import { Settings } from 'lucide-react';
import { StatCard } from '../components';
import { getDeviceTheme } from '../theme';
import type { DeviceState } from '../types';
import { CoverControls } from './cover';
import { LightControls } from './light';
import { LockControls } from './lock';
import { SensorControls } from './sensor';
import { SwitchControls } from './switch';
import { ThermostatControls } from './thermostat';

export function DeviceControls({
  device,
  height,
}: Readonly<{ device: DeviceState; height: number }>) {
  switch (device.deviceType) {
    case 'light':
      return <LightControls device={device} height={height} />;
    case 'lock':
      return <LockControls device={device} />;
    case 'cover':
      return <CoverControls device={device} />;
    case 'thermostat':
      return <ThermostatControls device={device} />;
    case 'switch':
      return <SwitchControls device={device} />;
    case 'sensor':
      return <SensorControls device={device} />;
    default:
      return (
        <StatCard
          icon={Settings}
          label={getDeviceTheme(device.deviceType).label}
          value={device.name}
        />
      );
  }
}
