/**
 * Switch controls — large centered power toggle with status label.
 */

import clsx from 'clsx';
import { Power } from 'lucide-react';
import { useCallback } from 'react';
import { getDeviceTheme } from '../theme';
import type { DeviceState } from '../types';
import { useSendCommand } from './send-command';

export function SwitchControls({ device }: Readonly<{ device: DeviceState }>) {
  const isOn = Boolean(device.state.on);
  const theme = getDeviceTheme('switch');
  const sendCommand = useSendCommand();

  const handleToggle = useCallback(() => {
    sendCommand(device.nodeId, 'toggle');
  }, [sendCommand, device.nodeId]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <button
        type="button"
        onClick={handleToggle}
        className="flex size-16 cursor-pointer items-center justify-center rounded-full transition-all duration-200 hover:scale-105 active:scale-95"
        style={
          isOn
            ? {
                backgroundColor: `${theme.accentColor}30`,
                boxShadow: `0 0 24px ${theme.accentColor}30, 0 0 8px ${theme.accentColor}20`,
                border: `2px solid ${theme.accentColor}`,
              }
            : { backgroundColor: 'rgba(255,255,255,0.08)' }
        }
      >
        <Power className={clsx('size-7', isOn ? 'text-white' : 'text-white/40')} />
      </button>
      <span className={clsx('text-sm font-semibold', isOn ? 'text-white' : 'text-white/50')}>
        {isOn ? 'On' : 'Off'}
      </span>
    </div>
  );
}
