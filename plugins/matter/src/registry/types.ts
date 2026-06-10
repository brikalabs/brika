/**
 * Contracts for the device-family registry.
 *
 * A device family (one file under `families/`) bundles everything Matter-side
 * for one device category: the device-type ids that classify it, the cluster
 * readers that produce its state keys, and the command executors (with zod
 * argument contracts) that drive it. `registry/index.ts` composes all families
 * and derives the flat structures the engine consumes.
 *
 * This module also owns the two cross-family single sources of truth:
 *   - `MATTER_COMMAND_VALUES`: every command name the controller can send
 *     (tools' z.enum, the command block's dropdown, and the action/route
 *     validators all derive from this tuple),
 *   - `MatterStateSchema`: the composed schema of every state attribute any
 *     cluster reader (or the controller's press recorder) can produce.
 */

import { type ZodInfer, type ZodType, z } from '@brika/sdk/schema';
import type { Endpoint } from '@project-chip/matter.js/device';
import { DEVICE_TYPE_VALUES } from '../display/attributes';
import { PRESS_TYPE_VALUES } from '../engine/press-tracker';

/** A matter.js device endpoint (node root, bridged child, button child, ...). */
export type MatterEndpoint = Endpoint;

/**
 * Device categories, validated. The tuple lives in display/attributes.ts
 * (browser-safe, zod-free); this schema is the server-side runtime contract
 * over it.
 */
export const DeviceTypeSchema = z.enum(DEVICE_TYPE_VALUES);

export type DeviceType = ZodInfer<typeof DeviceTypeSchema>;

/**
 * Every command the controller can send. Single source of truth: the tools'
 * z.enum, the command block's dropdown, and the action/route validators all
 * derive from this tuple. A name listed here must have exactly one executor
 * across all families (the registry composition enforces it).
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

/** Runtime validator for stringly-typed command inputs (actions, routes, tools). */
export const MatterCommandSchema = z.enum(MATTER_COMMAND_VALUES);

// ─── Typed device state ──────────────────────────────────────────────────────

/**
 * Composed schema of every attribute the cluster readers (and the controller's
 * press recorder) can produce, all optional. Field schemas normalize (coerce)
 * and act as the typing source of truth: `MatterState` is inferred from here.
 *
 * Every key here must have a display entry in `display/attributes.ts`
 * (`ATTRIBUTES`); the registry test enforces it.
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
    lastPress: z.enum(PRESS_TYPE_VALUES),
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

/** Build a {@link CommandArgsSpec} from a zod schema and a human-to-raw mapper. */
export function commandArgs<TOut>(
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

/** Shared zod fragment for 0-100 human-percent arguments. */
export const percentArg = z.coerce.number().min(0).max(100);

/** Clamp a raw numeric argument into the 0-100 percent range. */
export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

// ─── Cluster + family contracts ──────────────────────────────────────────────

export interface ClusterCommand {
  name: MatterCommand;
  /** State key that must be present for a device to support this command. */
  when: string;
  /** Human-unit argument contract; commands without one pass args through raw. */
  args?: CommandArgsSpec;
  /** Run the command on an endpoint. `args` are already raw Matter units. */
  execute(endpoint: MatterEndpoint, args: Record<string, string>): Promise<unknown>;
}

/**
 * Classification hint for endpoints whose deviceTypeList carries only
 * structural types (Hue bridges tag e.g. a dimmer endpoint with just
 * Bridged Node + Power Source).
 */
export interface ClassificationHint {
  type: DeviceType;
  /** The hint matches when ANY of these keys is present in the read state. */
  keys: readonly string[];
  /**
   * Lower checks first. The registry sorts all hints by this value, so the
   * priority a family declares is absolute, independent of family order.
   * Bands in use: 10 switch (must outrank light: wall modules expose both
   * Switch and OnOff clusters), 20 light, 30 lock, 40 cover, 50 thermostat,
   * 60 fan, 70 vacuum, 80 sensors (last: many devices carry a side sensor).
   */
  priority: number;
}

export interface ClusterEntry {
  /** Cluster name, for debugging. */
  id: string;
  /** Read this cluster's state from the endpoint into the flat record. */
  read?(ep: MatterEndpoint, state: Record<string, unknown>): void;
  commands?: readonly ClusterCommand[];
  classify?: ClassificationHint;
}

/**
 * One self-contained device family. Adding support for a new kind of device
 * means writing one module that exports a `DeviceFamily` and adding it to
 * `FAMILIES` in `registry/index.ts`.
 *
 * Order matters inside `clusters`: readers run in array order during a state
 * refresh, so a later entry may overwrite shared keys (the registry preserves
 * family order when flattening, e.g. the sensors family runs after thermostat
 * so a standalone temperature measurement wins over a thermostat's local one).
 */
export interface DeviceFamily {
  /** Family id, e.g. 'light'; used in composition error messages. */
  id: string;
  /** Matter device-type ids this family claims, e.g. 0x0100 -> 'light'. */
  deviceTypeIds: Readonly<Record<number, DeviceType>>;
  /** Cluster readers + command executors, in read order. */
  clusters: readonly ClusterEntry[];
}
