/**
 * Device controls dispatcher — routes to the appropriate control component
 * based on device type.
 */

import { Settings } from 'lucide-react';
import { StatCard } from '../_components';
import { getDeviceTheme } from '../theme';
import type { DeviceState } from '../types';
import { CoverControls } from './cover';
import { LightControls } from './light';
import { LockControls } from './lock';
import { RemoteControls } from './remote';
import { SensorControls } from './sensor';
import { SwitchControls } from './switch';
import { ThermostatControls } from './thermostat';
import { VacuumControls } from './vacuum';

export function DeviceControls({
  device,
  buttonChildren = [],
  height,
}: Readonly<{ device: DeviceState; buttonChildren?: DeviceState[]; height: number }>) {
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
      // Battery remotes (Hue dimmer, wall switch module) classify as 'switch'
      // but have no onOff cluster: a power toggle could only fail. Show the
      // live last-press panel instead.
      if (!device.commands?.includes('toggle')) {
        return <RemoteControls device={device} buttonChildren={buttonChildren} />;
      }
      return <SwitchControls device={device} />;
    case 'vacuum':
      return <VacuumControls device={device} />;
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
