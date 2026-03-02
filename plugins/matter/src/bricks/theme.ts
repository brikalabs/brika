/**
 * Device theme system — gradients, accent colors, and Lucide icons per device type.
 *
 * Inspired by the website weatherTheme() pattern and the weather plugin's
 * per-condition visual system. Gradients are dark enough for white text.
 */

import {
  Activity,
  Blinds,
  Lightbulb,
  Lock,
  LockOpen,
  Network,
  Power,
  Settings,
  Thermometer,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { DeviceType } from './types';

export interface DeviceTheme {
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Alternate icon for "off" / "open" state */
  iconAlt?: ComponentType<{ className?: string }>;
  /** CSS gradient string for full-bleed brick background */
  gradient: string;
  /** Hex accent color for icon containers, sliders, glow effects */
  accentColor: string;
  /** Glow color (used for ambient glow when device is active) */
  glow: string;
}

export const DEVICE_THEMES: Record<DeviceType, DeviceTheme> = {
  light: {
    label: 'Light',
    icon: Lightbulb,
    gradient: 'linear-gradient(135deg, #78500a 0%, #a16c14 50%, #c49020 100%)',
    accentColor: '#fbbf24',
    glow: '#fbbf24',
  },
  lock: {
    label: 'Lock',
    icon: Lock,
    iconAlt: LockOpen,
    gradient: 'linear-gradient(135deg, #2a2860 0%, #3d3a88 50%, #524faa 100%)',
    accentColor: '#818cf8',
    glow: '#818cf8',
  },
  cover: {
    label: 'Cover',
    icon: Blinds,
    gradient: 'linear-gradient(135deg, #0f4060 0%, #1a5a80 50%, #2574a0 100%)',
    accentColor: '#38bdf8',
    glow: '#38bdf8',
  },
  thermostat: {
    label: 'Thermostat',
    icon: Thermometer,
    gradient: 'linear-gradient(135deg, #6b1a1a 0%, #8b2828 50%, #aa3838 100%)',
    accentColor: '#f87171',
    glow: '#f87171',
  },
  switch: {
    label: 'Switch',
    icon: Power,
    gradient: 'linear-gradient(135deg, #0a4a2a 0%, #146838 50%, #1e8848 100%)',
    accentColor: '#4ade80',
    glow: '#4ade80',
  },
  sensor: {
    label: 'Sensor',
    icon: Activity,
    gradient: 'linear-gradient(135deg, #3a1a5a 0%, #502878 50%, #683898 100%)',
    accentColor: '#c084fc',
    glow: '#c084fc',
  },
  bridge: {
    label: 'Bridge',
    icon: Network,
    gradient: 'linear-gradient(135deg, #2a3040 0%, #3a4258 50%, #4a5470 100%)',
    accentColor: '#94a3b8',
    glow: '#94a3b8',
  },
  unknown: {
    label: 'Device',
    icon: Settings,
    gradient: 'linear-gradient(135deg, #2a3040 0%, #3a4258 50%, #4a5470 100%)',
    accentColor: '#94a3b8',
    glow: '#94a3b8',
  },
};

export function getDeviceTheme(type: DeviceType): DeviceTheme {
  return DEVICE_THEMES[type] ?? DEVICE_THEMES.unknown;
}
