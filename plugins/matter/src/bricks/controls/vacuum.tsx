/**
 * Vacuum controls, start / pause / resume / dock with the operational state.
 * Actions are a declarative table filtered by the commands the device actually
 * supports; the state label comes from the shared attribute registry.
 */

import { capture } from '@brika/sdk';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import clsx from 'clsx';
import { Home, Pause, Play } from 'lucide-react';
import { useCallback } from 'react';
import { formatAttribute } from '../../display/attributes';
import { getDeviceTheme } from '../theme';
import type { DeviceState } from '../types';
import { useSendCommand } from './send-command';

// Command values stay plain strings here: the typed `MatterCommand` union
// lives in the registry (server-only, zod + matter.js), and brick views must
// stay browser-safe. `DeviceState.commands` is string[] for the same reason.
const VACUUM_ACTIONS: readonly { command: string; labelKey: string; icon: typeof Play }[] = [
  { command: 'vacuumStart', labelKey: 'device.controls.start', icon: Play },
  { command: 'vacuumPause', labelKey: 'device.controls.pause', icon: Pause },
  { command: 'vacuumResume', labelKey: 'device.controls.resume', icon: Play },
  { command: 'vacuumDock', labelKey: 'device.controls.dock', icon: Home },
];

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
  const { t } = useLocale();
  const theme = getDeviceTheme('vacuum');
  const sendCommand = useSendCommand();
  const commands = device.commands ?? [];
  const vacuumState = device.state.vacuumState;
  const hasState = vacuumState !== null && vacuumState !== undefined;
  let stateLabel = t(device.online ? 'device.online' : 'device.offline');
  if (hasState) {
    stateLabel = formatAttribute('vacuumState', vacuumState, t);
  }

  const run = useCallback(
    (command: string) => {
      capture('matter.vacuum_command', { command });
      sendCommand(device.nodeId, command);
    },
    [sendCommand, device.nodeId]
  );

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <span className={clsx('font-semibold text-sm', hasState ? 'text-white' : 'text-white/50')}>
        {stateLabel}
      </span>
      <div className="flex items-center gap-2">
        {VACUUM_ACTIONS.filter((action) => commands.includes(action.command)).map((action) => (
          <VacuumButton
            key={action.command}
            label={t(action.labelKey)}
            icon={action.icon}
            accentColor={theme.accentColor}
            onPress={() => run(action.command)}
          />
        ))}
      </div>
    </div>
  );
}
