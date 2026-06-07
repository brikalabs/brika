/**
 * Build-time capability collector.
 *
 * At plugin runtime this is dormant: `defineReactiveBlock` / `defineSpark`
 * call `collectBlock` / `collectSpark`, which are no-ops because no sink is
 * installed. The `brika build` manifest generator calls `installCollector()`
 * first, imports the plugin's block/spark modules so their `define*` calls
 * run, then reads the captured metadata back with `drainCollector()`.
 *
 * The sink lives on `globalThis` so it is shared even if more than one
 * `@brika/sdk` instance is resolved during a build, and so the generator
 * (which lives in `@brika/compiler`) reads the exact records the plugin's
 * `@brika/sdk` wrote.
 */

import { z } from 'zod';
import type { BlockMeta } from '../blocks/reactive';

/** A block captured during a build pass. */
export interface CollectedBlock {
  id: string;
  meta?: BlockMeta;
}

/** Human-facing spark metadata lowered into the manifest `sparks[]` entry. */
export interface SparkMeta {
  name?: string;
  description?: string;
}

/** A spark captured during a build pass. */
export interface CollectedSpark {
  id: string;
  meta?: SparkMeta;
}

/** Everything captured during a single build pass. */
export interface CollectedManifest {
  blocks: CollectedBlock[];
  sparks: CollectedSpark[];
}

declare global {
  // Present only while `brika build` is collecting. Unset at plugin runtime,
  // which makes the collect* helpers below cheap no-ops.
  var __brikaCollect: CollectedManifest | undefined;
}

/** Begin capturing `define*` registrations. Resets any prior capture. */
export function installCollector(): void {
  globalThis.__brikaCollect = { blocks: [], sparks: [] };
}

/** Return the captured definitions and stop capturing. */
export function drainCollector(): CollectedManifest {
  const sink = globalThis.__brikaCollect ?? { blocks: [], sparks: [] };
  globalThis.__brikaCollect = undefined;
  return sink;
}

/** Record a block definition. No-op unless a collector is installed. */
export function collectBlock(block: CollectedBlock): void {
  globalThis.__brikaCollect?.blocks.push(block);
}

/** Record a spark definition. No-op unless a collector is installed. */
export function collectSpark(spark: CollectedSpark): void {
  globalThis.__brikaCollect?.sparks.push(spark);
}

// ─── Brick metadata + config lowering (brika build, phase B) ─────────────────
//
// Bricks have no `define*` call to hook, so `brika build` reads two named
// exports from the brick module instead: `meta` (display metadata) and an
// optional zod `config` schema, lowered here into the manifest `config[]`
// preference entries the host renders.

const BrickMetaSchema = z.object({
  name: z.optional(z.string()),
  description: z.optional(z.string()),
  category: z.optional(z.string()),
  icon: z.optional(z.string()),
  color: z.optional(z.string()),
  families: z.optional(z.array(z.enum(['sm', 'md', 'lg']))),
});

/** The validated shape of a brick module's `meta` export. */
export type BrickMetaInput = z.infer<typeof BrickMetaSchema>;

/** Validate a brick module's `meta` export. */
export function parseBrickMeta(
  value: unknown
): { ok: true; meta: BrickMetaInput } | { ok: false; error: string } {
  const result = BrickMetaSchema.safeParse(value);
  if (result.success) {
    return { ok: true, meta: result.data };
  }
  return {
    ok: false,
    error: result.error.issues.map((i) => `${i.path.join('.')} ${i.message}`.trim()).join('; '),
  };
}

/** Structural check for a zod schema, tolerant of cross-instance identity. */
export function isZodSchema(value: unknown): value is z.ZodType {
  return (
    value !== null &&
    typeof value === 'object' &&
    'safeParse' in value &&
    typeof value.safeParse === 'function'
  );
}

/** A generated manifest config entry (mirrors `@brika/schema` PreferenceSchema). */
export interface PreferenceEntry {
  type: 'text' | 'password' | 'number' | 'checkbox' | 'dropdown';
  name: string;
  label?: string;
  description?: string;
  required?: boolean;
  default?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string }>;
}

export interface PreferencesResult {
  preferences: PreferenceEntry[];
  warnings: string[];
}

/** The JSON-schema subset zod emits for a single config field. */
const PropertySchema = z.object({
  type: z.optional(z.string()),
  default: z.optional(z.unknown()),
  description: z.optional(z.string()),
  label: z.optional(z.string()),
  format: z.optional(z.string()),
  enum: z.optional(z.array(z.unknown())),
  minimum: z.optional(z.number()),
  maximum: z.optional(z.number()),
  multipleOf: z.optional(z.number()),
});

const JsonObjectSchema = z.object({
  properties: z.optional(z.record(z.string(), PropertySchema)),
  required: z.optional(z.array(z.string())),
});

type Property = z.infer<typeof PropertySchema>;

function scalarDefault(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return undefined;
}

function toPreference(
  name: string,
  prop: Property,
  jsonRequired: boolean,
  warnings: string[]
): PreferenceEntry | undefined {
  const def = scalarDefault(prop.default);
  const base = {
    name,
    ...(prop.label !== undefined ? { label: prop.label } : {}),
    ...(prop.description !== undefined ? { description: prop.description } : {}),
    ...(jsonRequired && prop.default === undefined ? { required: true } : {}),
    ...(def !== undefined ? { default: def } : {}),
  };
  if (prop.enum) {
    return { type: 'dropdown', ...base, options: prop.enum.map((v) => ({ value: String(v) })) };
  }
  if (prop.type === 'number') {
    return {
      type: 'number',
      ...base,
      ...(prop.minimum !== undefined ? { min: prop.minimum } : {}),
      ...(prop.maximum !== undefined ? { max: prop.maximum } : {}),
      ...(prop.multipleOf !== undefined ? { step: prop.multipleOf } : {}),
    };
  }
  if (prop.type === 'boolean') {
    return { type: 'checkbox', ...base };
  }
  if (prop.type === 'string') {
    return { type: prop.format === 'password' ? 'password' : 'text', ...base };
  }
  warnings.push(`field "${name}" has unsupported type "${prop.type ?? 'unknown'}"; skipped`);
  return undefined;
}

/**
 * Lower a brick's zod `config` object into manifest preference entries.
 *
 * Conventions: `.describe()` -> description, `.meta({ label })` -> label,
 * `.meta({ format: 'password' })` on a string -> password, `.multipleOf(n)` ->
 * number step, `.min`/`.max` -> min/max, enum -> dropdown. Unsupported field
 * types are reported as warnings rather than dropped silently.
 */
export function zodToPreferences(schema: z.ZodType): PreferencesResult {
  const warnings: string[] = [];
  let raw: unknown;
  try {
    raw = z.toJSONSchema(schema, { unrepresentable: 'any' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { preferences: [], warnings: [`config schema is not convertible: ${message}`] };
  }
  const parsed = JsonObjectSchema.safeParse(raw);
  if (!parsed.success) {
    return { preferences: [], warnings: ['config must be a zod object schema'] };
  }
  const props = parsed.data.properties ?? {};
  const required = new Set(parsed.data.required ?? []);
  const preferences: PreferenceEntry[] = [];
  for (const [name, prop] of Object.entries(props)) {
    const entry = toPreference(name, prop, required.has(name), warnings);
    if (entry) {
      preferences.push(entry);
    }
  }
  return { preferences, warnings };
}
