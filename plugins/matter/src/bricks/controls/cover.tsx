/**
 * Cover controls — position bar with open/stop/close buttons.
 * Position bar always visible when available.
 */

import { ChevronDown, ChevronUp, Square } from 'lucide-react';
import { useCallback } from 'react';
import { GlassButton } from '../components';
import { getDeviceTheme } from '../theme';
import type { DeviceState } from '../types';
import { useSendCommand } from './send-command';

export function CoverControls({ device }: Readonly<{ device: DeviceState }>) {
  const position = device.state.coverPosition == null ? null : Number(device.state.coverPosition);
  const theme = getDeviceTheme('cover');
  const sendCommand = useSendCommand();

  const handleOpen = useCallback(() => sendCommand(device.nodeId, 'coverOpen'), [sendCommand, device.nodeId]);
  const handleStop = useCallback(() => sendCommand(device.nodeId, 'coverStop'), [sendCommand, device.nodeId]);
  const handleClose = useCallback(() => sendCommand(device.nodeId, 'coverClose'), [sendCommand, device.nodeId]);

  return (
    <div className="flex flex-col gap-3">
      {/* Position bar */}
      {position != null && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/50">Position</span>
            <span className="text-[11px] font-bold text-white tabular-nums">{position}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{ width: `${position}%`, backgroundColor: theme.accentColor }}
            />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <GlassButton label="Open" icon={ChevronUp} onClick={handleOpen} />
        <GlassButton label="Stop" icon={Square} onClick={handleStop} />
        <GlassButton label="Close" icon={ChevronDown} onClick={handleClose} />
      </div>
    </div>
  );
}
