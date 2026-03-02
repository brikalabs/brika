/**
 * Shared UI components for Matter client bricks.
 *
 * Design language: white text on gradient backgrounds, glassmorphism buttons,
 * accent-colored fills, and subtle glow effects — inspired by the Spotify
 * and weather bricks and the website brick designs.
 */

import { useLocale } from '@brika/sdk/ui-kit/hooks';
import { cva } from 'class-variance-authority';
import clsx from 'clsx';
import { Power } from 'lucide-react';
import type { ComponentType } from 'react';
import { getDeviceTheme } from './theme';
import type { DeviceType } from './types';

// ─── StatusBadge ─────────────────────────────────────────────────────────────

export function StatusBadge({ online }: Readonly<{ online: boolean }>) {
  const { t } = useLocale();
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={clsx('size-2 shrink-0 rounded-full', online ? 'bg-emerald-400' : 'bg-white/25')}
        style={online ? { boxShadow: '0 0 6px rgba(52,211,153,0.5)' } : undefined}
      />
      <span className="text-[10px] text-white/50">
        {online ? t('device.online') : t('device.offline')}
      </span>
    </div>
  );
}

// ─── StatCard ────────────────────────────────────────────────────────────────

export function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  accentColor,
}: Readonly<{
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  suffix?: string;
  accentColor?: string;
}>) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-white/8 p-2">
      <div className="flex items-center gap-1.5">
        <Icon className="size-3 shrink-0 text-white/50" />
        <span className="truncate text-[10px] text-white/50">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className="font-bold text-white"
          style={accentColor ? { color: accentColor } : undefined}
        >
          {value}
        </span>
        {suffix ? <span className="text-[10px] text-white/40">{suffix}</span> : null}
      </div>
    </div>
  );
}

// ─── GlassButton ─────────────────────────────────────────────────────────────

const glassButtonVariants = cva(
  'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] cursor-pointer',
  {
    variants: {
      active: {
        true: 'bg-white/20 text-white shadow-[0_0_12px_rgba(255,255,255,0.08)]',
        false: 'bg-white/10 text-white/70 hover:bg-white/15',
      },
    },
    defaultVariants: { active: false },
  },
);

export function GlassButton({
  label,
  icon: Icon,
  onClick,
  active,
}: Readonly<{
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
  active?: boolean;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={glassButtonVariants({ active: active ?? false })}
    >
      {Icon ? <Icon className="size-3.5" /> : null}
      {label}
    </button>
  );
}

// ─── PowerToggle ─────────────────────────────────────────────────────────────

export function PowerToggle({
  isOn,
  accentColor,
  onToggle,
}: Readonly<{
  isOn: boolean;
  accentColor: string;
  onToggle: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex size-10 cursor-pointer items-center justify-center rounded-full transition-all duration-200 hover:scale-105 active:scale-95"
      style={
        isOn
          ? {
              backgroundColor: `${accentColor}30`,
              boxShadow: `0 0 16px ${accentColor}25`,
              border: `2px solid ${accentColor}`,
            }
          : { backgroundColor: 'rgba(255,255,255,0.08)' }
      }
    >
      <Power className={clsx('size-4', isOn ? 'text-white' : 'text-white/40')} />
    </button>
  );
}

// ─── DeviceSlider ────────────────────────────────────────────────────────────

export function DeviceSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  accentColor,
  onChange,
}: Readonly<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  accentColor: string;
  onChange: (value: number) => void;
}>) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/50">{label}</span>
        <span className="text-[11px] font-medium text-white tabular-nums">
          {value}
          {unit ?? ''}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-white/10">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-100"
          style={{ width: `${pct}%`, backgroundColor: accentColor }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:shadow-md"
        />
      </div>
    </div>
  );
}

// ─── DeviceIcon ──────────────────────────────────────────────────────────────

const deviceIconContainerVariants = cva('flex shrink-0 items-center justify-center rounded-full', {
  variants: {
    size: { sm: 'size-7', md: 'size-10' },
  },
  defaultVariants: { size: 'md' },
});

const deviceIconInnerVariants = cva('', {
  variants: {
    size: { sm: 'size-3.5', md: 'size-5' },
  },
  defaultVariants: { size: 'md' },
});

export function DeviceIcon({
  type,
  size = 'md',
}: Readonly<{ type: DeviceType; size?: 'sm' | 'md' }>) {
  const theme = getDeviceTheme(type);
  const Icon = theme.icon;

  return (
    <div
      className={deviceIconContainerVariants({ size })}
      style={{ backgroundColor: `${theme.accentColor}25` }}
    >
      <Icon className={deviceIconInnerVariants({ size })} style={{ color: theme.accentColor }} />
    </div>
  );
}

// ─── AmbientGlow ─────────────────────────────────────────────────────────────

export function AmbientGlow({
  color,
  active,
}: Readonly<{ color: string; active: boolean }>) {
  if (!active) return null;
  return (
    <div
      className="pointer-events-none absolute -top-[10%] -right-[10%] aspect-square h-[55%] animate-pulse rounded-full"
      style={{
        background: color,
        filter: 'blur(24px)',
        opacity: 0.3,
      }}
    />
  );
}
