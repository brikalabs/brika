/**
 * Matter Device — client-rendered brick.
 *
 * Adaptive layouts by size:
 *   1×1  — micro: centered icon + state label, tappable for toggleable devices
 *   N×1  — strip: horizontal row with icon, name, state label, tappable
 *   1×N  — narrow: vertical icon + name + controls with tight padding
 *   else — full: header + divider + controls, compact styling at ≤2×2
 *
 * Data is pushed from the plugin process via setBrickData('device', ...).
 * Commands are sent via callAction(doDeviceCommand, ...).
 */

import { useBrickConfig, useBrickData, useBrickSize } from '@brika/sdk/brick-views';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import clsx from 'clsx';
import { Loader2, Settings } from 'lucide-react';
import { useCallback } from 'react';
import { AmbientGlow, DeviceIcon, StatusBadge } from './components';
import { DeviceControls } from './controls';
import { useSendCommand } from './controls/send-command';
import { getDeviceTheme } from './theme';
import type { DeviceData, DeviceState } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Short state label for micro / strip layouts */
function stateLabel(device: DeviceState): string {
  switch (device.deviceType) {
    case 'light':
    case 'switch':
      return device.state.on ? 'On' : 'Off';
    case 'lock':
      return device.state.locked ? 'Locked' : 'Unlocked';
    case 'cover': {
      const pos = device.state.coverPosition;
      return pos == null ? 'Cover' : `${Number(pos)}%`;
    }
    case 'thermostat': {
      const temp = device.state.temperature;
      return temp == null ? '—' : `${Number(temp)}°`;
    }
    default:
      return device.online ? 'Online' : 'Offline';
  }
}

const TAPPABLE_TYPES: ReadonlySet<string> = new Set(['light', 'switch', 'lock']);

interface DeviceLayoutProps {
  device: DeviceState;
  theme: { gradient: string; glow: string };
  isActive: boolean;
  typeLabel: string;
  onTap: () => void;
}

function MicroLayout({ device, theme, isActive, onTap }: Readonly<DeviceLayoutProps>) {
  const tappable = TAPPABLE_TYPES.has(device.deviceType);
  const base = 'relative flex h-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-lg';
  const children = (
    <>
      <AmbientGlow color={theme.glow} active={isActive} />
      <DeviceIcon type={device.deviceType} />
      <span className="relative text-xs font-medium text-white/70">{stateLabel(device)}</span>
    </>
  );
  if (tappable) {
    return (
      <button
        type="button"
        className={`${base} cursor-pointer transition-transform duration-150 active:scale-[0.95]`}
        style={{ background: theme.gradient }}
        onClick={onTap}
      >
        {children}
      </button>
    );
  }
  return (
    <div className={base} style={{ background: theme.gradient }}>
      {children}
    </div>
  );
}

function StripLayout({ device, theme, isActive, typeLabel, onTap }: Readonly<DeviceLayoutProps>) {
  const tappable = TAPPABLE_TYPES.has(device.deviceType);
  const base = 'relative flex h-full items-center gap-2.5 overflow-hidden rounded-lg px-3';
  const children = (
    <>
      <AmbientGlow color={theme.glow} active={isActive} />
      <DeviceIcon type={device.deviceType} size="sm" />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <span className="truncate text-sm font-semibold text-white">{device.name}</span>
        <span className="text-[10px] text-white/50">{typeLabel}</span>
      </div>
      <span className="relative text-xs font-medium text-white/60">{stateLabel(device)}</span>
    </>
  );
  if (tappable) {
    return (
      <button
        type="button"
        className={`${base} cursor-pointer transition-transform duration-150 active:scale-[0.97]`}
        style={{ background: theme.gradient }}
        onClick={onTap}
      >
        {children}
      </button>
    );
  }
  return (
    <div className={base} style={{ background: theme.gradient }}>
      {children}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DeviceBrick() {
  const { width, height } = useBrickSize();
  const config = useBrickConfig();
  const data = useBrickData<DeviceData>();
  const { t } = useLocale();
  const sendCommand = useSendCommand();

  const deviceId =
    typeof config.deviceId === 'string' && config.deviceId ? config.deviceId : undefined;

  // ─── Loading ─────────────────────────────────────────────────────────

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-white/50" />
      </div>
    );
  }

  // ─── No device configured ────────────────────────────────────────────

  if (!deviceId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-3">
        <Settings className="size-6 text-muted-foreground/50" />
        <span className="text-xs text-muted-foreground">{t('device.noDeviceSelected')}</span>
      </div>
    );
  }

  // ─── Device not found ────────────────────────────────────────────────

  const device = data.deviceMap[deviceId];

  if (!device) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-3">
        <Settings className="size-6 text-muted-foreground/50" />
        <span className="text-xs text-muted-foreground">{t('device.deviceNotFound')}</span>
      </div>
    );
  }

  const theme = getDeviceTheme(device.deviceType);
  const isActive = device.online && Boolean(device.state.on ?? device.state.locked ?? true);
  const typeLabel = t(`device.types.${device.deviceType}`);

  // ─── Tap handler for micro/strip tappable devices ────────────────────

  const handleTap = useCallback(() => {
    if (device.deviceType === 'lock') {
      sendCommand(device.nodeId, device.state.locked ? 'unlock' : 'lock');
    } else {
      sendCommand(device.nodeId, 'toggle');
    }
  }, [sendCommand, device.nodeId, device.deviceType, device.state.locked]);

  // ─── Micro layout (1×1) ──────────────────────────────────────────────

  if (width <= 1 && height <= 1) {
    return <MicroLayout device={device} theme={theme} isActive={isActive} typeLabel={typeLabel} onTap={handleTap} />;
  }

  // ─── Strip layout (height ≤ 1) ───────────────────────────────────────

  if (height <= 1) {
    return <StripLayout device={device} theme={theme} isActive={isActive} typeLabel={typeLabel} onTap={handleTap} />;
  }

  // ─── Main layout ─────────────────────────────────────────────────────

  const compact = width <= 2 && height <= 2;

  return (
    <div
      className={clsx(
        'relative flex h-full flex-col overflow-hidden rounded-lg',
        compact ? 'gap-2 p-3' : 'gap-3 p-4',
      )}
      style={{ background: theme.gradient }}
    >
      <AmbientGlow color={theme.glow} active={isActive} />

      {/* Header */}
      <div className="relative flex items-center gap-2">
        <DeviceIcon type={device.deviceType} size={compact ? 'sm' : 'md'} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <span className={clsx('truncate font-bold text-white', compact && 'text-sm')}>
            {device.name}
          </span>
          <span className="text-[10px] text-white/50">{typeLabel}</span>
        </div>
        <StatusBadge online={device.online} />
      </div>

      {/* Divider */}
      {!compact && <div className="h-px bg-white/10" />}

      {/* Controls */}
      <div className="relative flex flex-1 flex-col">
        <DeviceControls device={device} height={height} />
      </div>
    </div>
  );
}
