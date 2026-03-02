/**
 * Lock controls — large animated lock icon with toggle button.
 */

import { Lock, LockOpen } from 'lucide-react';
import { useCallback } from 'react';
import { GlassButton } from '../components';
import { getDeviceTheme } from '../theme';
import type { DeviceState } from '../types';
import { useSendCommand } from './send-command';

export function LockControls({ device }: Readonly<{ device: DeviceState }>) {
  const isLocked = Boolean(device.state.locked);
  const theme = getDeviceTheme('lock');
  const LockIcon = isLocked ? Lock : LockOpen;
  const sendCommand = useSendCommand();

  const handleToggle = useCallback(() => {
    sendCommand(device.nodeId, isLocked ? 'unlock' : 'lock');
  }, [sendCommand, device.nodeId, isLocked]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <div
        className="flex size-16 items-center justify-center rounded-full transition-all duration-300"
        style={{
          backgroundColor: isLocked ? `${theme.accentColor}30` : 'rgba(255,255,255,0.08)',
          boxShadow: isLocked ? `0 0 24px ${theme.accentColor}25` : 'none',
        }}
      >
        <LockIcon
          className="size-7 transition-colors duration-300"
          style={{ color: isLocked ? theme.accentColor : 'rgba(255,255,255,0.4)' }}
        />
      </div>
      <GlassButton
        label={isLocked ? 'Unlock' : 'Lock'}
        icon={isLocked ? LockOpen : Lock}
        onClick={handleToggle}
        active={isLocked}
      />
    </div>
  );
}
