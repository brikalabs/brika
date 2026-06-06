/**
 * Shared device + command metadata for the Matter Command block.
 *
 * Single source of truth for the device-type icon map and the command catalog,
 * consumed by both the config view (which maps the catalog to a selectable
 * array) and the node-body view (which indexes it by command value).
 */

import {
  Blinds,
  Cpu,
  Lightbulb,
  Lock,
  type LucideIcon,
  Network,
  Power,
  PowerOff,
  Radar,
  Sun,
  Thermometer,
  ToggleLeft,
} from 'lucide-react';

export interface CommandConfig {
  nodeId?: string;
  command?: string;
  params?: Record<string, string>;
}

export const DEVICE_ICONS: Record<string, LucideIcon> = {
  light: Lightbulb,
  lock: Lock,
  cover: Blinds,
  thermostat: Thermometer,
  switch: ToggleLeft,
  sensor: Radar,
  bridge: Network,
  unknown: Cpu,
};

/** Single command catalog: ordered list of value + display metadata. */
export const COMMANDS: ReadonlyArray<{ value: string; label: string; icon: LucideIcon }> = [
  { value: 'on', label: 'Turn on', icon: Power },
  { value: 'off', label: 'Turn off', icon: PowerOff },
  { value: 'toggle', label: 'Toggle', icon: ToggleLeft },
  { value: 'setBrightness', label: 'Set brightness', icon: Sun },
  { value: 'setColorTemp', label: 'Set color temperature', icon: Thermometer },
];

/** Lookup view of the catalog, indexed by command value. */
export const COMMAND_META: Record<string, { label: string; icon: LucideIcon }> = Object.fromEntries(
  COMMANDS.map((c) => [c.value, { label: c.label, icon: c.icon }])
);
