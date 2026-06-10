/**
 * Single source of truth for every state attribute the Matter plugin maps.
 *
 * ZOD-FREE and browser-safe on purpose: brick .tsx views and pages VALUE-import
 * this module, so it must carry no zod and no server-only @brika/sdk imports
 * (the `brika check` import boundary enforces this). Pure data + pure functions.
 *
 * Consumers:
 *   - clusters.ts gives each key a zod schema (typed `MatterState`), and this
 *     module gives each key its human face (label, format, visibility).
 *   - The "When Device Changes" block derives its attribute dropdown from
 *     `WATCHABLE_ATTRIBUTE_KEYS`.
 *   - Bricks and pages render values through `formatAttribute`/`summarizeState`
 *     instead of per-component switch chains.
 */

// Mirrors the server-side union in clusters.ts; bricks/types.ts re-exports it
// so client views keep a single browser-safe declaration.
export type DeviceType =
  | 'light'
  | 'lock'
  | 'cover'
  | 'thermostat'
  | 'switch'
  | 'sensor'
  | 'fan'
  | 'vacuum'
  | 'bridge'
  | 'unknown';

export type AttributeCategory =
  | 'power'
  | 'level'
  | 'color'
  | 'climate'
  | 'security'
  | 'buttons'
  | 'sensor'
  | 'diagnostic';

export interface AttributeMeta {
  /** State key as produced by the cluster registry, e.g. 'brightness'. */
  key: string;
  kind: 'boolean' | 'number' | 'string';
  label: string;
  /** Human-readable rendering: '72%', 'On', '21.5°C', 'Double press'. */
  format: (value: unknown) => string;
  category: AttributeCategory;
  /** Appears in the "When Device Changes" attribute dropdown. */
  watchable: boolean;
  /** Lower = preferred one-line summary for micro/strip labels and stat cards. */
  summaryPriority?: number;
  /** Internal key: never shown on boards. */
  hidden?: boolean;
  /** Optional summary that may combine sibling attributes ('B2 double'). */
  summarize?: (value: unknown, state: Readonly<Record<string, unknown>>) => string;
}

// ─── Shared label tables ─────────────────────────────────────────────────────

/** Long labels for normalized press gestures (remote panels, summaries). */
export const PRESS_LABELS: Readonly<Record<string, string>> = {
  short: 'Short press',
  long: 'Long press',
  double: 'Double press',
  triple: 'Triple press',
  multi: 'Multi press',
};

/** Compact labels for normalized press gestures (per-button chips). */
export const PRESS_SHORT_LABELS: Readonly<Record<string, string>> = {
  short: 'short',
  long: 'long',
  double: '2x',
  triple: '3x',
  multi: 'multi',
};

/** Matter RVC OperationalState codes mapped to human labels. */
export const VACUUM_STATE_LABELS: Readonly<Record<string, string>> = {
  '0': 'Stopped',
  '1': 'Running',
  '2': 'Paused',
  '3': 'Error',
  '64': 'Seeking charger',
  '65': 'Charging',
  '66': 'Docked',
};

// ─── Formatting helpers (pure, tolerant of any input) ───────────────────────

function asText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

function percent(value: unknown): string {
  return `${asText(value)}%`;
}

function onOff(value: unknown): string {
  return value ? 'On' : 'Off';
}

/** 'B2 double': the last gesture with its button when the device reports one. */
function summarizeLastPress(value: unknown, state: Readonly<Record<string, unknown>>): string {
  const button = state.lastButton;
  if (button === null || button === undefined) {
    return asText(value);
  }
  return `B${asText(button)} ${asText(value)}`;
}

// ─── The registry ────────────────────────────────────────────────────────────

/**
 * Every state key the cluster registry (or the controller's press recorder)
 * can produce. Order matches the historical "When Device Changes" dropdown.
 */
export const ATTRIBUTES: readonly AttributeMeta[] = [
  {
    key: 'on',
    kind: 'boolean',
    label: 'Power',
    format: onOff,
    category: 'power',
    watchable: true,
    summaryPriority: 1,
  },
  {
    key: 'brightness',
    kind: 'number',
    label: 'Brightness',
    format: percent,
    category: 'level',
    watchable: true,
    summaryPriority: 4,
  },
  {
    key: 'hue',
    kind: 'number',
    label: 'Hue',
    format: (value) => `${asText(value)}°`,
    category: 'color',
    watchable: true,
  },
  {
    key: 'saturation',
    kind: 'number',
    label: 'Saturation',
    format: percent,
    category: 'color',
    watchable: true,
  },
  {
    key: 'colorTempMireds',
    kind: 'number',
    label: 'Color temperature',
    format: (value) => `${asText(value)} mireds`,
    category: 'color',
    watchable: true,
  },
  {
    key: 'colorMode',
    kind: 'number',
    label: 'Color mode',
    format: asText,
    category: 'color',
    watchable: true,
    hidden: true,
  },
  {
    key: 'locked',
    kind: 'boolean',
    label: 'Lock',
    format: (value) => (value ? 'Locked' : 'Unlocked'),
    category: 'security',
    watchable: true,
    summaryPriority: 1,
  },
  {
    key: 'lockState',
    kind: 'number',
    label: 'Lock state',
    format: asText,
    category: 'security',
    watchable: true,
    hidden: true,
  },
  {
    key: 'coverPosition',
    kind: 'number',
    label: 'Position',
    format: percent,
    category: 'level',
    watchable: true,
    summaryPriority: 1,
  },
  {
    key: 'coverOperational',
    kind: 'string',
    label: 'Cover activity',
    format: asText,
    category: 'level',
    watchable: true,
  },
  {
    key: 'temperature',
    kind: 'number',
    label: 'Temperature',
    format: (value) => `${asText(value)}°C`,
    category: 'climate',
    watchable: true,
    summaryPriority: 10,
  },
  {
    key: 'humidity',
    kind: 'number',
    label: 'Humidity',
    format: percent,
    category: 'climate',
    watchable: true,
    summaryPriority: 11,
  },
  {
    key: 'occupied',
    kind: 'boolean',
    label: 'Occupancy',
    format: (value) => (value ? 'Occupied' : 'Clear'),
    category: 'sensor',
    watchable: true,
    summaryPriority: 12,
  },
  {
    key: 'contact',
    kind: 'boolean',
    label: 'Contact',
    format: (value) => (value ? 'Closed' : 'Open'),
    category: 'sensor',
    watchable: true,
    summaryPriority: 13,
  },
  {
    key: 'illuminance',
    kind: 'number',
    label: 'Light level',
    format: (value) => `${asText(value)} lx`,
    category: 'sensor',
    watchable: true,
    summaryPriority: 14,
  },
  {
    key: 'battery',
    kind: 'number',
    label: 'Battery',
    format: percent,
    category: 'diagnostic',
    watchable: true,
    summaryPriority: 20,
  },
  {
    key: 'buttonPosition',
    kind: 'number',
    label: 'Button position',
    format: asText,
    category: 'buttons',
    watchable: true,
    hidden: true,
  },
  {
    key: 'buttons',
    kind: 'number',
    label: 'Button count',
    format: asText,
    category: 'buttons',
    watchable: false,
    hidden: true,
  },
  {
    key: 'lastPress',
    kind: 'string',
    label: 'Last press',
    format: (value) => PRESS_LABELS[asText(value)] ?? asText(value),
    category: 'buttons',
    watchable: true,
    summaryPriority: 2,
    summarize: summarizeLastPress,
  },
  {
    key: 'lastButton',
    kind: 'number',
    label: 'Last button',
    format: (value) => `Button ${asText(value)}`,
    category: 'buttons',
    watchable: true,
  },
  {
    key: 'fanMode',
    kind: 'number',
    label: 'Fan mode',
    format: asText,
    category: 'level',
    watchable: true,
    summaryPriority: 6,
  },
  {
    key: 'fanSpeed',
    kind: 'number',
    label: 'Fan speed',
    format: percent,
    category: 'level',
    watchable: true,
    summaryPriority: 5,
  },
  {
    key: 'vacuumState',
    kind: 'number',
    label: 'Vacuum state',
    format: (value) => VACUUM_STATE_LABELS[asText(value)] ?? asText(value),
    category: 'power',
    watchable: true,
    summaryPriority: 1,
  },
  {
    key: 'systemMode',
    kind: 'number',
    label: 'System mode',
    format: asText,
    category: 'climate',
    watchable: true,
  },
  {
    key: 'systemModeName',
    kind: 'string',
    label: 'Mode',
    format: asText,
    category: 'climate',
    watchable: true,
  },
];

/** Lookup by state key; unknown keys yield undefined (callers fall back). */
export const ATTRIBUTE_BY_KEY: Readonly<Record<string, AttributeMeta | undefined>> =
  Object.fromEntries(ATTRIBUTES.map((meta) => [meta.key, meta]));

/** Keys offered by the "When Device Changes" dropdown (derived, not hand-kept). */
export const WATCHABLE_ATTRIBUTE_KEYS: readonly string[] = ATTRIBUTES.filter(
  (meta) => meta.watchable
).map((meta) => meta.key);

/** Sort weight for stat cards: prioritized attributes first, the rest last. */
export function attributePriority(key: string): number {
  return ATTRIBUTE_BY_KEY[key]?.summaryPriority ?? 99;
}

/** Render one attribute value for humans; unknown keys fall back to String(). */
export function formatAttribute(key: string, value: unknown): string {
  const meta = ATTRIBUTE_BY_KEY[key];
  if (!meta) {
    return asText(value);
  }
  return meta.format(value);
}

// ─── One-line device summaries ───────────────────────────────────────────────

/**
 * Per device type, the ordered attribute keys a one-line summary prefers.
 * The resolver picks the first key present in state and formats it.
 */
export const SUMMARY_RULES: Readonly<Record<DeviceType, readonly string[]>> = {
  light: ['on'],
  switch: ['on', 'lastPress', 'battery'],
  lock: ['locked'],
  cover: ['coverPosition'],
  thermostat: ['temperature'],
  fan: ['fanSpeed', 'fanMode'],
  vacuum: ['vacuumState'],
  sensor: ['temperature', 'humidity', 'occupied', 'contact', 'illuminance', 'battery'],
  bridge: [],
  unknown: [],
};

/**
 * The ONE short state label for micro/strip layouts. Replaces the per-type
 * switch chains: walks SUMMARY_RULES for the device type, formats the first
 * present attribute, and falls back to the connection state.
 */
export function summarizeState(
  state: Readonly<Record<string, unknown>>,
  deviceType: DeviceType,
  commands: readonly string[],
  online: boolean
): string {
  for (const key of SUMMARY_RULES[deviceType]) {
    // 'on' is only a meaningful summary when the device can actually be
    // switched; battery remotes classify as 'switch' without an onOff cluster.
    if (key === 'on' && !commands.includes('toggle')) {
      continue;
    }
    const value = state[key];
    if (value === null || value === undefined) {
      continue;
    }
    const meta = ATTRIBUTE_BY_KEY[key];
    if (!meta) {
      continue;
    }
    return meta.summarize ? meta.summarize(value, state) : meta.format(value);
  }
  return online ? 'Online' : 'Offline';
}
