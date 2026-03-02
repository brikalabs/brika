/**
 * Thermostat controls — large centered temperature display with mode badge.
 */

import { getDeviceTheme } from '../theme';
import type { DeviceState } from '../types';

export function ThermostatControls({ device }: Readonly<{ device: DeviceState }>) {
  const temp = device.state.temperature;
  const modeName =
    typeof device.state.systemModeName === 'string' ? device.state.systemModeName : null;
  const theme = getDeviceTheme('thermostat');

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2">
      {temp != null && (
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-white">{Number(temp)}</span>
          <span className="text-lg text-white/50">{'\u00B0C'}</span>
        </div>
      )}
      {modeName && (
        <span
          className="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium"
          style={{ backgroundColor: `${theme.accentColor}25`, color: theme.accentColor }}
        >
          {modeName}
        </span>
      )}
    </div>
  );
}
