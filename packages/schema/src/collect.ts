/**
 * Build-time capability collector: zod-backed helpers.
 *
 * The zod-free sink (install/drain/collect*) lives in `./collect-sink` so it can
 * be imported by the browser-bundled `@brika/sdk/brick` without pulling zod. This
 * module re-exports the sink and adds the zod-dependent lowering used by the
 * `brika build` generator (legacy brick `meta` parsing + config -> preferences).
 *
 * Lives in `@brika/schema` (the leaf package) so `@brika/compiler` consumes the
 * collect contract without depending on `@brika/sdk`. The SDK-side counterpart
 * (`@brika/sdk/collect`) re-exports this module and adds `installBuildContext`,
 * which needs the SDK's prelude-bridge brand and therefore stays there.
 */

import { z } from 'zod';

export type {
  BlockMeta,
  BrickMeta,
  CollectedBlock,
  CollectedBrick,
  CollectedManifest,
  CollectedSpark,
  CollectedTool,
  SparkMeta,
} from './collect-sink';
export {
  collectBlock,
  collectBrick,
  collectSpark,
  collectTool,
  drainCollector,
  installCollector,
} from './collect-sink';

// ─── Brick metadata + config lowering (brika build) ──────────────────────────
//
// The legacy `.tsx`-export brick path reads a `meta` named export and validates
// it here; the `defineBrick` descriptor path carries typed meta directly. Both
// lower their zod `config` to manifest `config[]` via zodToPreferences.

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

/** A generated manifest config entry (mirrors `./plugin` PreferenceSchema). */
export interface PreferenceEntry {
  type: 'text' | 'password' | 'number' | 'checkbox' | 'dropdown' | 'dynamic-dropdown';
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

/** Map a field's base + type-specific shape onto a manifest preference entry. */
function preferenceField<B extends { name: string }>(
  prop: Property,
  base: B,
  name: string,
  warnings: string[]
): PreferenceEntry | undefined {
  // A string field whose options are fetched at runtime via
  // definePreferenceOptions(name) — marked with `.meta({ format })` (z.dynamicDropdown()).
  if (prop.format === 'dynamic-dropdown') {
    return { type: 'dynamic-dropdown', ...base };
  }
  if (prop.enum) {
    return { type: 'dropdown', ...base, options: prop.enum.map((v) => ({ value: String(v) })) };
  }
  if (prop.type === 'number') {
    return {
      type: 'number',
      ...base,
      ...(prop.minimum === undefined ? {} : { min: prop.minimum }),
      ...(prop.maximum === undefined ? {} : { max: prop.maximum }),
      ...(prop.multipleOf === undefined ? {} : { step: prop.multipleOf }),
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

function toPreference(
  name: string,
  prop: Property,
  jsonRequired: boolean,
  warnings: string[]
): PreferenceEntry | undefined {
  const def = scalarDefault(prop.default);
  const base = {
    name,
    ...(prop.label === undefined ? {} : { label: prop.label }),
    ...(prop.description === undefined ? {} : { description: prop.description }),
    ...(jsonRequired && prop.default === undefined ? { required: true } : {}),
    ...(def === undefined ? {} : { default: def }),
  };
  return preferenceField(prop, base, name, warnings);
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
