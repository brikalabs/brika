/**
 * Declarative Matter cluster registry.
 *
 * One entry per supported cluster. Each entry knows how to:
 *   - read its cluster state into the flat device state record (every produced
 *     slice is normalized through `MatterStateSchema`, the typed-state SSOT),
 *   - execute the commands it offers (args arrive in RAW Matter units; commands
 *     with a human-units surface also carry a zod `args` contract used by the
 *     AI tools to validate and convert),
 *   - classify a device when its deviceTypeList carries only structural types.
 *
 * The controller and device model derive everything (state, supported
 * commands, fallback classification) by iterating this array, so adding a
 * device family means adding one entry here.
 *
 * Endpoint access uses `ep.maybeStateOf(Client)` / `ep.commandsOf(Client)`
 * with the behavior client inside each entry, which keeps the cluster state
 * fully typed. Feature-gated members that the base client types do not carry
 * (colorControl entirely, window-covering lift percentage, power-source
 * battery) go through the string behavior-id overloads instead: the same
 * cached state view, just stringly typed.
 *
 * Entry order matters twice:
 *   - state read order (later entries may overwrite shared keys, e.g. a
 *     standalone temperature measurement wins over a thermostat's local one),
 *   - classification priority (first entry whose keys match wins; `switch`
 *     leads so Hue dimmer button endpoints never classify as lights).
 */

import { z } from '@brika/sdk';
import type { ZodInfer, ZodType } from '@brika/sdk/schema';
import { BooleanStateClient } from '@matter/main/behaviors/boolean-state';
import { DoorLockClient } from '@matter/main/behaviors/door-lock';
import { FanControlClient } from '@matter/main/behaviors/fan-control';
import { IlluminanceMeasurementClient } from '@matter/main/behaviors/illuminance-measurement';
import { LevelControlClient } from '@matter/main/behaviors/level-control';
import { OccupancySensingClient } from '@matter/main/behaviors/occupancy-sensing';
import { OnOffClient } from '@matter/main/behaviors/on-off';
import { RelativeHumidityMeasurementClient } from '@matter/main/behaviors/relative-humidity-measurement';
import { RvcOperationalStateClient } from '@matter/main/behaviors/rvc-operational-state';
import { RvcRunModeClient } from '@matter/main/behaviors/rvc-run-mode';
import { SwitchClient } from '@matter/main/behaviors/switch';
import { TemperatureMeasurementClient } from '@matter/main/behaviors/temperature-measurement';
import { ThermostatClient } from '@matter/main/behaviors/thermostat';
import { WindowCoveringClient } from '@matter/main/behaviors/window-covering';
import { DoorLock, RvcRunMode, Thermostat } from '@matter/main/clusters';
import type { Endpoint } from '@project-chip/matter.js/device';

/** A matter.js device endpoint (node root, bridged child, button child, ...). */
export type MatterEndpoint = Endpoint;

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

/**
 * Every command the controller can send. Single source of truth: the tools'
 * z.enum and the command block's dropdown both derive from this tuple.
 */
export const MATTER_COMMAND_VALUES = [
  'on',
  'off',
  'toggle',
  'setBrightness',
  'setColorTemp',
  'setHueSaturation',
  'lock',
  'unlock',
  'coverOpen',
  'coverClose',
  'coverStop',
  'setCoverPosition',
  'setTargetTemp',
  'setFanMode',
  'setFanSpeed',
  'vacuumStart',
  'vacuumPause',
  'vacuumResume',
  'vacuumDock',
] as const;

export type MatterCommand = (typeof MATTER_COMMAND_VALUES)[number];

// ─── Typed device state ──────────────────────────────────────────────────────

/**
 * Composed schema of every attribute the cluster readers (and the controller's
 * press recorder) can produce, all optional. Field schemas normalize (coerce)
 * and act as the typing source of truth: `MatterState` is inferred from here.
 */
export const MatterStateSchema = z
  .object({
    on: z.boolean(),
    brightness: z.coerce.number(),
    hue: z.coerce.number(),
    saturation: z.coerce.number(),
    colorTempMireds: z.coerce.number(),
    colorMode: z.coerce.number(),
    locked: z.boolean(),
    lockState: z.coerce.number().nullable(),
    coverPosition: z.coerce.number().nullable(),
    coverOperational: z.object({
      global: z.coerce.number().optional(),
      lift: z.coerce.number().optional(),
      tilt: z.coerce.number().optional(),
    }),
    temperature: z.coerce.number().nullable(),
    humidity: z.coerce.number(),
    occupied: z.boolean(),
    contact: z.boolean(),
    illuminance: z.coerce.number(),
    battery: z.coerce.number(),
    buttonPosition: z.coerce.number(),
    buttons: z.coerce.number(),
    lastPress: z.enum(['short', 'long', 'double', 'triple', 'multi']),
    lastButton: z.coerce.number(),
    fanMode: z.coerce.number(),
    fanSpeed: z.coerce.number(),
    vacuumState: z.coerce.number(),
    systemMode: z.coerce.number(),
    systemModeName: z.string(),
  })
  .partial();

export type MatterState = ZodInfer<typeof MatterStateSchema>;

const STATE_FIELD_SCHEMAS: ReadonlyMap<string, ZodType> = new Map(
  Object.entries(MatterStateSchema.shape)
);

/**
 * Parse one reader's slice of raw cluster values into typed state. Validation
 * is field-level: a malformed cluster value drops THAT attribute, never the
 * refresh; keys outside the schema are stripped.
 */
export function parseStateSlice(slice: Record<string, unknown>): MatterState {
  const valid: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(slice)) {
    const field = STATE_FIELD_SCHEMAS.get(key);
    const parsed = field?.safeParse(value);
    if (parsed?.success && parsed.data !== undefined) {
      valid[key] = parsed.data;
    }
  }
  const result = MatterStateSchema.safeParse(valid);
  return result.success ? result.data : {};
}

// ─── Command argument contracts ──────────────────────────────────────────────

export type CommandArgsResult =
  | { ok: true; raw: Record<string, string> }
  | { ok: false; error: string };

/**
 * Human-units argument contract for a command. The AI tool surface speaks
 * percent/degrees/kelvin; `convert` validates those and translates them into
 * the raw Matter units the executors expect (level 0-254, hue 0-254, mireds).
 */
export interface CommandArgsSpec {
  /** Usage in human units, echoed in tool errors so a model can self-correct. */
  usage: string;
  convert(args: Record<string, string> | undefined): CommandArgsResult;
}

function commandArgs<TOut>(
  schema: ZodType<TOut>,
  usage: string,
  toRaw: (parsed: TOut) => Record<string, string>
): CommandArgsSpec {
  return {
    usage,
    convert(args) {
      const parsed = schema.safeParse(args ?? {});
      if (!parsed.success) {
        return { ok: false, error: `expected ${usage}` };
      }
      return { ok: true, raw: toRaw(parsed.data) };
    },
  };
}

const percentArg = z.coerce.number().min(0).max(100);

export interface ClusterCommand {
  name: MatterCommand;
  /** State key that must be present for a device to support this command. */
  when: string;
  /** Human-unit argument contract; commands without one pass args through raw. */
  args?: CommandArgsSpec;
  /** Run the command on an endpoint. `args` are already raw Matter units. */
  execute(endpoint: MatterEndpoint, args: Record<string, string>): Promise<unknown>;
}

export interface ClusterEntry {
  /** Cluster name, for debugging. */
  id: string;
  /** Read this cluster's state from the endpoint into the flat record. */
  read?(ep: MatterEndpoint, state: Record<string, unknown>): void;
  commands?: readonly ClusterCommand[];
  /** Classification hint when deviceTypeList carries only structural types. */
  classify?: { type: DeviceType; keys: readonly string[] };
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Find the run mode tagged Cleaning so `vacuumStart` works without a mode arg. */
function resolveCleaningMode(ep: MatterEndpoint, modeArg: string | undefined): number {
  if (modeArg !== undefined) {
    return Number(modeArg);
  }
  const supported = ep.maybeStateOf(RvcRunModeClient)?.supportedModes ?? [];
  for (const mode of supported) {
    const isCleaning = mode.modeTags.some(
      (tag) => Number(tag.value) === RvcRunMode.ModeTag.Cleaning
    );
    if (isCleaning) {
      return Number(mode.mode);
    }
  }
  return 1;
}

export const CLUSTER_REGISTRY: readonly ClusterEntry[] = [
  {
    id: 'switch',
    read: (ep, state) => {
      const cs = ep.maybeStateOf(SwitchClient);
      if (!cs) {
        return;
      }
      state.buttonPosition = Number(cs.currentPosition ?? 0);
      state.buttons = Number(cs.numberOfPositions ?? 2);
    },
    classify: { type: 'switch', keys: ['buttonPosition'] },
  },
  {
    id: 'onOff',
    read: (ep, state) => {
      const cs = ep.maybeStateOf(OnOffClient);
      if (!cs) {
        return;
      }
      state.on = cs.onOff;
    },
    classify: { type: 'light', keys: ['on'] },
    commands: [
      { name: 'on', when: 'on', execute: (ep) => ep.commandsOf(OnOffClient).on() },
      { name: 'off', when: 'on', execute: (ep) => ep.commandsOf(OnOffClient).off() },
      { name: 'toggle', when: 'on', execute: (ep) => ep.commandsOf(OnOffClient).toggle() },
    ],
  },
  {
    id: 'levelControl',
    read: (ep, state) => {
      const cs = ep.maybeStateOf(LevelControlClient);
      if (!cs) {
        return;
      }
      const level = cs.currentLevel ?? 0;
      state.brightness = Math.round((Number(level) / 254) * 100);
    },
    classify: { type: 'light', keys: ['brightness'] },
    commands: [
      {
        name: 'setBrightness',
        when: 'brightness',
        args: commandArgs(
          z.object({
            brightness: percentArg.optional(),
            // Legacy alias: some callers still send { level } in percent.
            level: percentArg.optional(),
          }),
          '{ "brightness": "0-100" }',
          (parsed) => {
            const pct = parsed.brightness ?? parsed.level ?? 100;
            return { level: String(Math.round((pct / 100) * 254)) };
          }
        ),
        execute: (ep, args) =>
          ep.commandsOf(LevelControlClient).moveToLevel({
            level: Number(args.level ?? 254),
            transitionTime: 10, // 1 second
            optionsMask: { coupleColorTempToLevel: false, executeIfOff: true },
            optionsOverride: { coupleColorTempToLevel: false, executeIfOff: true },
          }),
      },
    ],
  },
  {
    id: 'colorControl',
    // ColorControlClient isn't barrel-exported by matter.js and its members
    // are feature-gated anyway, so state and commands go through the generic
    // string behavior-id surface (the same cached view as before).
    read: (ep, state) => {
      const colorState = ep.maybeStateOf('colorControl');
      if (!colorState) {
        return;
      }
      state.colorMode = colorState.colorMode;
      if (colorState.currentHue !== null) {
        state.hue = Math.round((Number(colorState.currentHue) / 254) * 360);
      }
      if (colorState.currentSaturation !== null) {
        state.saturation = Math.round((Number(colorState.currentSaturation) / 254) * 100);
      }
      if (colorState.colorTemperatureMireds !== null) {
        state.colorTempMireds = Number(colorState.colorTemperatureMireds);
      }
    },
    commands: [
      {
        name: 'setColorTemp',
        when: 'colorTempMireds',
        args: commandArgs(
          z.object({
            kelvin: z.coerce.number().min(1000).max(10000).optional(),
            mireds: z.coerce.number().min(100).max(1000).optional(),
          }),
          '{ "kelvin": "1000-10000" } or { "mireds": "100-1000" }',
          (parsed) => {
            const mireds =
              parsed.kelvin === undefined
                ? (parsed.mireds ?? 370)
                : Math.round(1_000_000 / parsed.kelvin);
            return { mireds: String(mireds) };
          }
        ),
        execute: (ep, args) =>
          ep.commandsOf('colorControl').moveToColorTemperature({
            colorTemperatureMireds: Number(args.mireds ?? 370),
            transitionTime: 5,
            optionsMask: { executeIfOff: true },
            optionsOverride: { executeIfOff: true },
          }),
      },
      {
        name: 'setHueSaturation',
        when: 'hue',
        args: commandArgs(
          z.object({
            hue: z.coerce.number().min(0).max(360).default(0),
            saturation: percentArg.default(100),
          }),
          '{ "hue": "0-360", "saturation": "0-100" }',
          (parsed) => ({
            hue: String(Math.round((parsed.hue / 360) * 254)),
            saturation: String(Math.round((parsed.saturation / 100) * 254)),
          })
        ),
        execute: (ep, args) =>
          ep.commandsOf('colorControl').moveToHueAndSaturation({
            hue: Number(args.hue ?? 0),
            saturation: Number(args.saturation ?? 254),
            transitionTime: 5,
            optionsMask: { executeIfOff: true },
            optionsOverride: { executeIfOff: true },
          }),
      },
    ],
  },
  {
    id: 'doorLock',
    read: (ep, state) => {
      const cs = ep.maybeStateOf(DoorLockClient);
      if (!cs) {
        return;
      }
      const ls = cs.lockState;
      state.locked = ls === DoorLock.LockState.Locked;
      state.lockState = ls;
    },
    classify: { type: 'lock', keys: ['locked'] },
    commands: [
      { name: 'lock', when: 'locked', execute: (ep) => ep.commandsOf(DoorLockClient).lockDoor({}) },
      {
        name: 'unlock',
        when: 'locked',
        execute: (ep) => ep.commandsOf(DoorLockClient).unlockDoor({}),
      },
    ],
  },
  {
    id: 'windowCovering',
    // Lift percentage is feature-gated, so read through the string surface.
    read: (ep, state) => {
      const cs = ep.maybeStateOf('windowCovering');
      if (!cs) {
        return;
      }
      state.coverPosition = cs.currentPositionLiftPercentage ?? null;
      state.coverOperational = cs.operationalStatus;
    },
    classify: { type: 'cover', keys: ['coverPosition'] },
    commands: [
      {
        name: 'coverOpen',
        when: 'coverPosition',
        execute: (ep) => ep.commandsOf(WindowCoveringClient).upOrOpen(),
      },
      {
        name: 'coverClose',
        when: 'coverPosition',
        execute: (ep) => ep.commandsOf(WindowCoveringClient).downOrClose(),
      },
      {
        name: 'coverStop',
        when: 'coverPosition',
        execute: (ep) => ep.commandsOf(WindowCoveringClient).stopMotion(),
      },
      {
        name: 'setCoverPosition',
        when: 'coverPosition',
        // Human percent IS the raw Matter unit (lift percentage).
        args: commandArgs(
          z.object({ position: percentArg.default(0) }),
          '{ "position": "0-100" }',
          (parsed) => ({ position: String(Math.round(parsed.position)) })
        ),
        // goToLiftPercentage is feature-gated like the lift attributes.
        execute: (ep, args) =>
          ep.commandsOf('windowCovering').goToLiftPercentage({
            liftPercent100thsValue: Math.round(clampPercent(Number(args.position ?? 0)) * 100),
          }),
      },
    ],
  },
  {
    id: 'thermostat',
    read: (ep, state) => {
      const cs = ep.maybeStateOf(ThermostatClient);
      if (!cs) {
        return;
      }
      const local = cs.localTemperature;
      state.temperature = local === null ? null : Number(local) / 100;
      state.systemMode = cs.systemMode;
      state.systemModeName = Thermostat.SystemMode[cs.systemMode] ?? 'unknown';
    },
    classify: { type: 'thermostat', keys: ['systemMode'] },
    commands: [
      {
        name: 'setTargetTemp',
        when: 'systemMode',
        execute: (ep, args) =>
          ep.commandsOf(ThermostatClient).setpointRaiseLower({
            amount: Number(args.amount ?? 0),
            mode: Number(args.mode ?? 0), // 0 = heat, 1 = cool, 2 = both
          }),
      },
    ],
  },
  {
    id: 'fanControl',
    read: (ep, state) => {
      const cs = ep.maybeStateOf(FanControlClient);
      if (!cs) {
        return;
      }
      state.fanMode = Number(cs.fanMode);
      if (cs.percentSetting !== null && cs.percentSetting !== undefined) {
        state.fanSpeed = Number(cs.percentSetting);
      }
    },
    classify: { type: 'fan', keys: ['fanMode'] },
    commands: [
      {
        name: 'setFanMode',
        when: 'fanMode',
        // fanMode is a writable attribute, not a cluster command.
        execute: (ep, args) => ep.setStateOf(FanControlClient, { fanMode: Number(args.mode ?? 0) }),
      },
      {
        name: 'setFanSpeed',
        when: 'fanMode',
        // Human percent IS the raw Matter unit (percentSetting).
        args: commandArgs(
          z.object({ speed: percentArg.default(0) }),
          '{ "speed": "0-100" }',
          (parsed) => ({ speed: String(Math.round(parsed.speed)) })
        ),
        execute: (ep, args) =>
          ep.setStateOf(FanControlClient, {
            percentSetting: Math.round(clampPercent(Number(args.speed ?? 0))),
          }),
      },
    ],
  },
  {
    id: 'rvcRunMode',
    commands: [
      {
        name: 'vacuumStart',
        when: 'vacuumState',
        execute: (ep, args) =>
          ep.commandsOf(RvcRunModeClient).changeToMode({
            newMode: resolveCleaningMode(ep, args.mode),
          }),
      },
    ],
  },
  {
    id: 'rvcOperationalState',
    read: (ep, state) => {
      const cs = ep.maybeStateOf(RvcOperationalStateClient);
      if (!cs) {
        return;
      }
      const op = cs.operationalState;
      if (op !== null && op !== undefined) {
        state.vacuumState = Number(op);
      }
    },
    classify: { type: 'vacuum', keys: ['vacuumState'] },
    commands: [
      {
        name: 'vacuumPause',
        when: 'vacuumState',
        execute: (ep) => ep.commandsOf(RvcOperationalStateClient).pause(),
      },
      {
        name: 'vacuumResume',
        when: 'vacuumState',
        execute: (ep) => ep.commandsOf(RvcOperationalStateClient).resume(),
      },
      {
        name: 'vacuumDock',
        when: 'vacuumState',
        execute: (ep) => ep.commandsOf(RvcOperationalStateClient).goHome(),
      },
    ],
  },
  {
    id: 'powerSource',
    // batPercentRemaining is feature-gated (BAT), so read through the string surface.
    read: (ep, state) => {
      const battery = ep.maybeStateOf('powerSource')?.batPercentRemaining;
      if (battery !== null && battery !== undefined) {
        // Matter reports battery in half-percent units.
        state.battery = Math.round(Number(battery) / 2);
      }
    },
  },
  {
    id: 'temperatureMeasurement',
    read: (ep, state) => {
      const temperature = ep.maybeStateOf(TemperatureMeasurementClient)?.measuredValue;
      if (temperature !== null && temperature !== undefined) {
        state.temperature = Number(temperature) / 100;
      }
    },
    classify: { type: 'sensor', keys: ['temperature'] },
  },
  {
    id: 'relativeHumidityMeasurement',
    read: (ep, state) => {
      const humidity = ep.maybeStateOf(RelativeHumidityMeasurementClient)?.measuredValue;
      if (humidity !== null && humidity !== undefined) {
        state.humidity = Number(humidity) / 100;
      }
    },
    classify: { type: 'sensor', keys: ['humidity'] },
  },
  {
    id: 'occupancySensing',
    read: (ep, state) => {
      const cs = ep.maybeStateOf(OccupancySensingClient);
      if (!cs) {
        return;
      }
      state.occupied = Boolean(cs.occupancy?.occupied);
    },
    classify: { type: 'sensor', keys: ['occupied'] },
  },
  {
    id: 'illuminanceMeasurement',
    read: (ep, state) => {
      const illuminance = ep.maybeStateOf(IlluminanceMeasurementClient)?.measuredValue;
      if (illuminance !== null && illuminance !== undefined) {
        state.illuminance = Number(illuminance);
      }
    },
    classify: { type: 'sensor', keys: ['illuminance'] },
  },
  {
    id: 'booleanState',
    read: (ep, state) => {
      const cs = ep.maybeStateOf(BooleanStateClient);
      if (!cs) {
        return;
      }
      state.contact = Boolean(cs.stateValue);
    },
    classify: { type: 'sensor', keys: ['contact'] },
  },
];

let commandIndex: Map<MatterCommand, ClusterCommand> | undefined;

/** Look up a command's executor across the whole registry. */
export function getClusterCommand(name: MatterCommand): ClusterCommand | undefined {
  if (!commandIndex) {
    commandIndex = new Map();
    for (const entry of CLUSTER_REGISTRY) {
      for (const command of entry.commands ?? []) {
        commandIndex.set(command.name, command);
      }
    }
  }
  return commandIndex.get(name);
}
