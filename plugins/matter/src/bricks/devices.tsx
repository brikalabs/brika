/**
 * Matter Devices — client-rendered brick.
 *
 * Displays all commissioned Matter devices with online/offline status,
 * device type icons, and names in a responsive grid. Uses a deep indigo
 * gradient background with per-device accent colors.
 *
 * Data is pushed from the plugin process via setBrickData('devices', ...).
 */

import { useBrickData, useBrickSize } from '@brika/sdk/brick-views';
import { useLocale } from '@brika/sdk/ui-kit/hooks';
import clsx from 'clsx';
import { Loader2, Network } from 'lucide-react';
import { DeviceIcon } from './components';
import type { DeviceSummary, DevicesData } from './types';

const OVERVIEW_GRADIENT = 'linear-gradient(135deg, #1a1e38 0%, #252a48 50%, #303658 100%)';

function gridCols(width: number): string {
  if (width >= 6) return 'grid-cols-3';
  if (width >= 4) return 'grid-cols-2';
  return 'grid-cols-1';
}

function DeviceCard({ device }: Readonly<{ device: DeviceSummary }>) {
  const { t } = useLocale();
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white/8 px-2.5 py-2 transition-colors hover:bg-white/12">
      <DeviceIcon type={device.deviceType} size="sm" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <span className="truncate text-xs font-medium text-white">{device.name}</span>
        <span className="text-[10px] text-white/40">
          {t(`device.types.${device.deviceType}`)}
        </span>
      </div>
      <span
        className={clsx('size-2 shrink-0 rounded-full', device.online ? 'bg-emerald-400' : 'bg-white/20')}
        style={device.online ? { boxShadow: '0 0 4px rgba(52,211,153,0.4)' } : undefined}
      />
    </div>
  );
}

export default function DevicesBrick() {
  const { width, height } = useBrickSize();
  const data = useBrickData<DevicesData>();
  const { t } = useLocale();

  // ─── Loading ─────────────────────────────────────────────────────────

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-white/50" />
      </div>
    );
  }

  const devices = data.devices ?? [];
  const commissioned = devices.filter((d) => d.commissioned);
  const online = commissioned.filter((d) => d.online);

  return (
    <div
      className="flex h-full flex-col gap-3 overflow-hidden rounded-lg p-4"
      style={{ background: OVERVIEW_GRADIENT }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(99,102,241,0.2)' }}
        >
          <Network className="size-5 text-indigo-400" />
        </div>
        <div>
          <span className="text-[11px] text-white/50">{t('device.matterDevices')}</span>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-white">{online.length}</span>
            <span className="text-sm text-white/40">/ {commissioned.length}</span>
          </div>
        </div>
      </div>

      {/* Divider */}
      {height >= 3 && commissioned.length > 0 && <div className="h-px bg-white/10" />}

      {/* Device grid */}
      {height >= 3 && commissioned.length > 0 && (
        <div className={`grid ${gridCols(width)} gap-2 overflow-y-auto`}>
          {commissioned.map((d) => (
            <DeviceCard key={d.nodeId} device={d} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {commissioned.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-xs text-white/40">{t('device.noDevicesCommissioned')}</span>
        </div>
      )}
    </div>
  );
}
