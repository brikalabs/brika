/**
 * Remote controls, for battery switches (Hue dimmer, wall switch module) that
 * have no controllable cluster: the meaningful display is what was PRESSED.
 *
 * Multi-button remotes render one chip per button (each button endpoint keeps
 * its own lastPress, so every chip shows its own last gesture and the most
 * recently pressed one lights up). Single-button devices keep the centered
 * last-press display. Battery shows when the device reports one.
 */

import { useLocale } from '@brika/sdk/ui-kit/hooks';
import clsx from 'clsx';
import { BatteryMedium, CircleDot } from 'lucide-react';
import { PRESS_LABEL_KEYS, PRESS_SHORT_LABELS } from '../../display/attributes';
import { StatCard } from '../_components';
import { getDeviceTheme } from '../theme';
import type { DeviceState } from '../types';

function lastPressOf(device: DeviceState): string | undefined {
  return typeof device.state.lastPress === 'string' ? device.state.lastPress : undefined;
}

/** Long-form translated gesture label; unknown gestures fall back to raw text. */
function pressLabel(press: string, t: (k: string) => string): string {
  const key = PRESS_LABEL_KEYS[press];
  return key === undefined ? press : t(key);
}

function ButtonChip({
  child,
  active,
  accentColor,
}: Readonly<{ child: DeviceState; active: boolean; accentColor: string }>) {
  const press = lastPressOf(child);
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex size-11 items-center justify-center rounded-full transition-all duration-200"
        style={
          active
            ? {
                backgroundColor: `${accentColor}30`,
                boxShadow: `0 0 16px ${accentColor}40`,
                border: `2px solid ${accentColor}`,
              }
            : {
                backgroundColor: 'rgba(255,255,255,0.08)',
                border: '2px solid transparent',
              }
        }
      >
        <span className={clsx('font-bold text-sm', active ? 'text-white' : 'text-white/60')}>
          {child.button ?? '?'}
        </span>
      </div>
      <span className={clsx('text-[10px]', active ? 'text-white/80' : 'text-white/40')}>
        {press === undefined ? '·' : (PRESS_SHORT_LABELS[press] ?? press)}
      </span>
    </div>
  );
}

function BatteryCard({ device }: Readonly<{ device: DeviceState }>) {
  const { t } = useLocale();
  const battery = device.state.battery;
  if (battery === undefined || battery === null) {
    return null;
  }
  return (
    <StatCard
      icon={BatteryMedium}
      label={t('device.attributes.battery')}
      value={`${String(battery)}%`}
      accentColor={getDeviceTheme('switch').accentColor}
    />
  );
}

export function RemoteControls({
  device,
  buttonChildren = [],
}: Readonly<{ device: DeviceState; buttonChildren?: DeviceState[] }>) {
  const { t } = useLocale();
  const theme = getDeviceTheme('switch');
  const lastPress = lastPressOf(device);
  const lastButton = device.state.lastButton;

  // Multi-button remote: one chip per button, the last-pressed one lit.
  if (buttonChildren.length > 1) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <div className="flex items-center gap-3">
          {buttonChildren.map((child) => (
            <ButtonChip
              key={child.nodeId}
              child={child}
              active={lastPress !== undefined && child.button === lastButton}
              accentColor={theme.accentColor}
            />
          ))}
        </div>
        {lastPress !== undefined && (
          <span className="text-white/60 text-xs">
            {`${t('device.values.button')} ${String(lastButton ?? '?')}: ${pressLabel(lastPress, t)}`}
          </span>
        )}
        <BatteryCard device={device} />
      </div>
    );
  }

  // Single button (or a button endpoint picked directly): centered display.
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
            {lastButton === undefined
              ? t('device.values.button')
              : `${t('device.values.button')} ${String(lastButton)}`}
          </span>
          <span className="text-white/60 text-xs">{pressLabel(lastPress, t)}</span>
        </div>
      ) : (
        <span className="text-white/50 text-xs">{t('device.remote.pressHint')}</span>
      )}
      <BatteryCard device={device} />
    </div>
  );
}
