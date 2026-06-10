/**
 * Vacuum controls, start / pause / resume / dock with the operational state.
 * Buttons render only for the commands the device actually supports.
 */

import { capture } from '@brika/sdk';
import clsx from 'clsx';
import { Home, Pause, Play } from 'lucide-react';
import { useCallback } from 'react';
import { getDeviceTheme } from '../theme';
import type { DeviceState } from '../types';
import { useSendCommand } from './send-command';

function VacuumButton({
  label,
  icon: Icon,
  accentColor,
  onPress,
}: Readonly<{
  label: string;
  icon: typeof Play;
  accentColor: string;
  onPress: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="flex flex-col items-center gap-1.5 rounded-xl px-4 py-3 transition-all duration-150 hover:scale-105 active:scale-95"
      style={{ backgroundColor: `${accentColor}20`, border: `1px solid ${accentColor}40` }}
    >
      <Icon className="size-5 text-white/90" />
      <span className="font-medium text-[11px] text-white/70">{label}</span>
    </button>
  );
}

export function VacuumControls({ device }: Readonly<{ device: DeviceState }>) {
  const theme = getDeviceTheme('vacuum');
  const sendCommand = useSendCommand();
  const commands = device.commands ?? [];
  const vacuumState =
    typeof device.state.vacuumState === 'string' ? device.state.vacuumState : undefined;

  const run = useCallback(
    (command: string) => {
      capture('matter.vacuum_command', { command });
      sendCommand(device.nodeId, command);
    },
    [sendCommand, device.nodeId]
  );

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <span className={clsx('font-semibold text-sm', vacuumState ? 'text-white' : 'text-white/50')}>
        {vacuumState ?? (device.online ? 'Ready' : 'Offline')}
      </span>
      <div className="flex items-center gap-2">
        {commands.includes('vacuumStart') && (
          <VacuumButton
            label="Start"
            icon={Play}
            accentColor={theme.accentColor}
            onPress={() => run('vacuumStart')}
          />
        )}
        {commands.includes('vacuumPause') && (
          <VacuumButton
            label="Pause"
            icon={Pause}
            accentColor={theme.accentColor}
            onPress={() => run('vacuumPause')}
          />
        )}
        {commands.includes('vacuumResume') && (
          <VacuumButton
            label="Resume"
            icon={Play}
            accentColor={theme.accentColor}
            onPress={() => run('vacuumResume')}
          />
        )}
        {commands.includes('vacuumDock') && (
          <VacuumButton
            label="Dock"
            icon={Home}
            accentColor={theme.accentColor}
            onPress={() => run('vacuumDock')}
          />
        )}
      </div>
    </div>
  );
}
