/**
 * Remote controls, for battery switches (Hue dimmer, wall switch module) that
 * have no controllable cluster: the meaningful display is what was PRESSED.
 * Shows the last press live (the controller records it into device state) and
 * the battery level when the device reports one.
 */

import { BatteryMedium, CircleDot } from 'lucide-react';
import { StatCard } from '../_components';
import { getDeviceTheme } from '../theme';
import type { DeviceState } from '../types';

const PRESS_LABELS: Record<string, string> = {
  short: 'Short press',
  long: 'Long press',
  double: 'Double press',
  triple: 'Triple press',
  multi: 'Multi press',
};

export function RemoteControls({ device }: Readonly<{ device: DeviceState }>) {
  const theme = getDeviceTheme('switch');
  const lastPress = typeof device.state.lastPress === 'string' ? device.state.lastPress : undefined;
  const lastButton = device.state.lastButton;
  const battery = device.state.battery;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <div
        className="flex size-16 items-center justify-center rounded-full"
        style={
          lastPress
            ? {
                backgroundColor: `${theme.accentColor}30`,
                boxShadow: `0 0 24px ${theme.accentColor}30`,
                border: `2px solid ${theme.accentColor}`,
              }
            : { backgroundColor: 'rgba(255,255,255,0.08)' }
        }
      >
        <CircleDot className="size-7 text-white/80" />
      </div>
      {lastPress ? (
        <div className="flex flex-col items-center">
          <span className="font-semibold text-sm text-white">
            {lastButton === undefined ? 'Button' : `Button ${String(lastButton)}`}
          </span>
          <span className="text-white/60 text-xs">{PRESS_LABELS[lastPress] ?? lastPress}</span>
        </div>
      ) : (
        <span className="text-white/50 text-xs">Press a button on the remote</span>
      )}
      {battery !== undefined && battery !== null && (
        <StatCard
          icon={BatteryMedium}
          label="Battery"
          value={`${String(battery)}%`}
          accentColor={theme.accentColor}
        />
      )}
    </div>
  );
}
