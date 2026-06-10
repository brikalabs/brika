/**
 * Shared device + command metadata for the Matter Command block.
 *
 * Single source of truth for the device-type icon map and the command catalog,
 * consumed by both the config view (which filters the catalog by the selected
 * device's type) and the node-body view (which indexes it by command value).
 */

import {
  ArrowDown,
  ArrowUp,
  Blinds,
  Bot,
  Cpu,
  Fan,
  Gauge,
  Home,
  Lightbulb,
  Lock,
  LockOpen,
  type LucideIcon,
  MoveVertical,
  Network,
  Palette,
  Pause,
  Play,
  Power,
  PowerOff,
  Radar,
  Square,
  StepForward,
  Sun,
  Sunset,
  Thermometer,
  ToggleLeft,
} from 'lucide-react';
import type { DeviceType } from '../matter-controller';

export interface CommandConfig {
  nodeId?: string;
  command?: string;
  params?: Record<string, string>;
}

export const DEVICE_ICONS: Record<DeviceType, LucideIcon> = {
  light: Lightbulb,
  lock: Lock,
  cover: Blinds,
  thermostat: Thermometer,
  switch: ToggleLeft,
  sensor: Radar,
  fan: Fan,
  vacuum: Bot,
  bridge: Network,
  unknown: Cpu,
};

/** A single command's value + display metadata + which device types it applies to. */
export interface CommandEntry {
  value: string;
  label: string;
  icon: LucideIcon;
  deviceTypes: DeviceType[];
}

/**
 * Single command catalog: ordered list of value + display metadata.
 *
 * `deviceTypes` marks which device categories each command applies to. Sensors
 * are read-only and therefore appear in no command's list.
 */
export const COMMANDS: ReadonlyArray<CommandEntry> = [
  {
    value: 'on',
    label: 'Turn on',
    icon: Power,
    deviceTypes: ['light', 'switch', 'bridge', 'unknown'],
  },
  {
    value: 'off',
    label: 'Turn off',
    icon: PowerOff,
    deviceTypes: ['light', 'switch', 'bridge', 'unknown'],
  },
  {
    value: 'toggle',
    label: 'Toggle',
    icon: ToggleLeft,
    deviceTypes: ['light', 'switch', 'bridge', 'unknown'],
  },
  { value: 'setBrightness', label: 'Set brightness', icon: Sun, deviceTypes: ['light'] },
  { value: 'setColorTemp', label: 'Set color temperature', icon: Sunset, deviceTypes: ['light'] },
  {
    value: 'setHueSaturation',
    label: 'Set hue and saturation',
    icon: Palette,
    deviceTypes: ['light'],
  },
  { value: 'lock', label: 'Lock', icon: Lock, deviceTypes: ['lock'] },
  { value: 'unlock', label: 'Unlock', icon: LockOpen, deviceTypes: ['lock'] },
  { value: 'coverOpen', label: 'Open cover', icon: ArrowUp, deviceTypes: ['cover'] },
  { value: 'coverClose', label: 'Close cover', icon: ArrowDown, deviceTypes: ['cover'] },
  { value: 'coverStop', label: 'Stop cover', icon: Square, deviceTypes: ['cover'] },
  {
    value: 'setCoverPosition',
    label: 'Set cover position',
    icon: MoveVertical,
    deviceTypes: ['cover'],
  },
  {
    value: 'setTargetTemp',
    label: 'Set target temperature',
    icon: Thermometer,
    deviceTypes: ['thermostat'],
  },
  { value: 'setFanMode', label: 'Set fan mode', icon: Fan, deviceTypes: ['fan'] },
  { value: 'setFanSpeed', label: 'Set fan speed', icon: Gauge, deviceTypes: ['fan'] },
  { value: 'vacuumStart', label: 'Start cleaning', icon: Play, deviceTypes: ['vacuum'] },
  { value: 'vacuumPause', label: 'Pause cleaning', icon: Pause, deviceTypes: ['vacuum'] },
  { value: 'vacuumResume', label: 'Resume cleaning', icon: StepForward, deviceTypes: ['vacuum'] },
  { value: 'vacuumDock', label: 'Return to dock', icon: Home, deviceTypes: ['vacuum'] },
];

/** Command values available when no device is selected (generic power controls). */
export const DEFAULT_COMMAND_VALUES: ReadonlyArray<string> = ['on', 'off', 'toggle'];

/** Filter the catalog to the commands valid for a given device type. */
export function commandsForDeviceType(deviceType: DeviceType | undefined): CommandEntry[] {
  if (deviceType === undefined) {
    return COMMANDS.filter((c) => DEFAULT_COMMAND_VALUES.includes(c.value));
  }
  return COMMANDS.filter((c) => c.deviceTypes.includes(deviceType));
}

/** Lookup view of the catalog, indexed by command value. */
export const COMMAND_META: Record<string, { label: string; icon: LucideIcon }> = Object.fromEntries(
  COMMANDS.map((c) => [c.value, { label: c.label, icon: c.icon }])
);
