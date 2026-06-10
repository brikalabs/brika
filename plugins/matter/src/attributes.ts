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

/**
 * Every device category the plugin maps. Runtime source of truth: clusters.ts
 * builds its zod `DeviceTypeSchema` from this tuple, and the type below is
 * structurally identical to its inference (this module stays zod-free).
 */
export const DEVICE_TYPE_VALUES = [
  'light',
  'lock',
  'cover',
  'thermostat',
  'switch',
  'sensor',
  'fan',
  'vacuum',
  'bridge',
  'unknown',
] as const;

export type DeviceType = (typeof DEVICE_TYPE_VALUES)[number];

export const ATTRIBUTE_CATEGORY_VALUES = [
  'power',
  'level',
  'color',
  'climate',
  'security',
  'buttons',
  'sensor',
  'diagnostic',
] as const;

export type AttributeCategory = (typeof ATTRIBUTE_CATEGORY_VALUES)[number];

export const ATTRIBUTE_KIND_VALUES = ['boolean', 'number', 'string'] as const;

export type AttributeKind = (typeof ATTRIBUTE_KIND_VALUES)[number];

/** Translate contract: views pass `t` from useLocale, unit tests pass a stub. */
export type TranslateFn = (key: string) => string;

export interface AttributeMeta {
  /** State key as produced by the cluster registry, e.g. 'brightness'. */
  key: string;
  kind: AttributeKind;
  /** i18n key for the human label, e.g. 'device.attributes.brightness'. */
  labelKey: string;
  /** Human-readable rendering: '72%', t('device.values.on'), '21.5°C'. */
  format: (value: unknown, t: TranslateFn) => string;
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

/** i18n keys for the long-form press gestures (remote panels, summaries). */
export const PRESS_LABEL_KEYS: Readonly<Record<string, string>> = {
  short: 'device.press.short',
  long: 'device.press.long',
  double: 'device.press.double',
  triple: 'device.press.triple',
  multi: 'device.press.multi',
};

/**
 * Compact labels for normalized press gestures (per-button chips).
 * Deliberately NOT translated: these are width-constrained chip glyphs
 * ('2x', 'long'), technical shorthand rather than prose.
 */
export const PRESS_SHORT_LABELS: Readonly<Record<string, string>> = {
  short: 'short',
  long: 'long',
  double: '2x',
  triple: '3x',
  multi: 'multi',
};

/** Matter RVC OperationalState codes mapped to i18n keys. */
export const VACUUM_STATE_KEYS: Readonly<Record<string, string>> = {
  '0': 'device.vacuum.stopped',
  '1': 'device.vacuum.running',
  '2': 'device.vacuum.paused',
  '3': 'device.vacuum.error',
  '64': 'device.vacuum.seekingCharger',
  '65': 'device.vacuum.charging',
  '66': 'device.vacuum.docked',
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

function onOff(value: unknown, t: TranslateFn): string {
  return t(value ? 'device.values.on' : 'device.values.off');
}

/** Translate a value through a key table, falling back to the raw text. */
function translateMapped(
  keys: Readonly<Record<string, string>>,
  value: unknown,
  t: TranslateFn
): string {
  const key = keys[asText(value)];
  return key === undefined ? asText(value) : t(key);
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
    labelKey: 'device.attributes.on',
    format: onOff,
    category: 'power',
    watchable: true,
    summaryPriority: 1,
  },
  {
    key: 'brightness',
    kind: 'number',
    labelKey: 'device.attributes.brightness',
    format: percent,
    category: 'level',
    watchable: true,
    summaryPriority: 4,
  },
  {
    key: 'hue',
    kind: 'number',
    labelKey: 'device.attributes.hue',
    format: (value) => `${asText(value)}°`,
    category: 'color',
    watchable: true,
  },
  {
    key: 'saturation',
    kind: 'number',
    labelKey: 'device.attributes.saturation',
    format: percent,
    category: 'color',
    watchable: true,
  },
  {
    key: 'colorTempMireds',
    kind: 'number',
    labelKey: 'device.attributes.colorTempMireds',
    format: (value) => `${asText(value)} mireds`,
    category: 'color',
    watchable: true,
  },
  {
    key: 'colorMode',
    kind: 'number',
    labelKey: 'device.attributes.colorMode',
    format: asText,
    category: 'color',
    watchable: true,
    hidden: true,
  },
  {
    key: 'locked',
    kind: 'boolean',
    labelKey: 'device.attributes.locked',
    format: (value, t) => t(value ? 'device.values.locked' : 'device.values.unlocked'),
    category: 'security',
    watchable: true,
    summaryPriority: 1,
  },
  {
    key: 'lockState',
    kind: 'number',
    labelKey: 'device.attributes.lockState',
    format: asText,
    category: 'security',
    watchable: true,
    hidden: true,
  },
  {
    key: 'coverPosition',
    kind: 'number',
    labelKey: 'device.attributes.coverPosition',
    format: percent,
    category: 'level',
    watchable: true,
    summaryPriority: 1,
  },
  {
    key: 'coverOperational',
    kind: 'string',
    labelKey: 'device.attributes.coverOperational',
    format: asText,
    category: 'level',
    watchable: true,
  },
  {
    key: 'temperature',
    kind: 'number',
    labelKey: 'device.attributes.temperature',
    format: (value) => `${asText(value)}°C`,
    category: 'climate',
    watchable: true,
    summaryPriority: 10,
  },
  {
    key: 'humidity',
    kind: 'number',
    labelKey: 'device.attributes.humidity',
    format: percent,
    category: 'climate',
    watchable: true,
    summaryPriority: 11,
  },
  {
    key: 'occupied',
    kind: 'boolean',
    labelKey: 'device.attributes.occupied',
    format: (value, t) => t(value ? 'device.values.occupied' : 'device.values.clear'),
    category: 'sensor',
    watchable: true,
    summaryPriority: 12,
  },
  {
    key: 'contact',
    kind: 'boolean',
    labelKey: 'device.attributes.contact',
    format: (value, t) => t(value ? 'device.values.closed' : 'device.values.open'),
    category: 'sensor',
    watchable: true,
    summaryPriority: 13,
  },
  {
    key: 'illuminance',
    kind: 'number',
    labelKey: 'device.attributes.illuminance',
    format: (value) => `${asText(value)} lx`,
    category: 'sensor',
    watchable: true,
    summaryPriority: 14,
  },
  {
    key: 'battery',
    kind: 'number',
    labelKey: 'device.attributes.battery',
    format: percent,
    category: 'diagnostic',
    watchable: true,
    summaryPriority: 20,
  },
  {
    key: 'buttonPosition',
    kind: 'number',
    labelKey: 'device.attributes.buttonPosition',
    format: asText,
    category: 'buttons',
    watchable: true,
    hidden: true,
  },
  {
    key: 'buttons',
    kind: 'number',
    labelKey: 'device.attributes.buttons',
    format: asText,
    category: 'buttons',
    watchable: false,
    hidden: true,
  },
  {
    key: 'lastPress',
    kind: 'string',
    labelKey: 'device.attributes.lastPress',
    format: (value, t) => translateMapped(PRESS_LABEL_KEYS, value, t),
    category: 'buttons',
    watchable: true,
    summaryPriority: 2,
    summarize: summarizeLastPress,
  },
  {
    key: 'lastButton',
    kind: 'number',
    labelKey: 'device.attributes.lastButton',
    format: (value, t) => `${t('device.values.button')} ${asText(value)}`,
    category: 'buttons',
    watchable: true,
  },
  {
    key: 'fanMode',
    kind: 'number',
    labelKey: 'device.attributes.fanMode',
    format: asText,
    category: 'level',
    watchable: true,
    summaryPriority: 6,
  },
  {
    key: 'fanSpeed',
    kind: 'number',
    labelKey: 'device.attributes.fanSpeed',
    format: percent,
    category: 'level',
    watchable: true,
    summaryPriority: 5,
  },
  {
    key: 'vacuumState',
    kind: 'number',
    labelKey: 'device.attributes.vacuumState',
    format: (value, t) => translateMapped(VACUUM_STATE_KEYS, value, t),
    category: 'power',
    watchable: true,
    summaryPriority: 1,
  },
  {
    key: 'systemMode',
    kind: 'number',
    labelKey: 'device.attributes.systemMode',
    format: asText,
    category: 'climate',
    watchable: true,
  },
  {
    key: 'systemModeName',
    kind: 'string',
    labelKey: 'device.attributes.systemModeName',
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
export function formatAttribute(key: string, value: unknown, t: TranslateFn): string {
  const meta = ATTRIBUTE_BY_KEY[key];
  if (!meta) {
    return asText(value);
  }
  return meta.format(value, t);
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
  online: boolean,
  t: TranslateFn
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
    return meta.summarize ? meta.summarize(value, state) : meta.format(value, t);
  }
  return t(online ? 'device.online' : 'device.offline');
}
