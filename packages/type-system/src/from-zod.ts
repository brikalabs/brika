/**
 * Zod → TypeDescriptor conversion.
 *
 * Converts Zod schemas to TypeDescriptor, handling:
 * - Standard Zod types (string, number, object, array, union, enum, etc.)
 * - GenericRef, PassthroughRef, ResolvedRef marker objects from @brika/sdk
 *
 * This function is used at block registration time (SDK side) to produce
 * TypeDescriptor metadata that ships over IPC.
 */

import type { TypeDescriptor } from './descriptor';

/**
 * Convert a Zod schema or SDK marker ref to a TypeDescriptor.
 *
 * @param schemaOrRef - A Zod schema, GenericRef, PassthroughRef, or ResolvedRef
 * @returns TypeDescriptor
 */
export function zodToDescriptor(schemaOrRef: unknown): TypeDescriptor {
  // Handle SDK marker refs (GenericRef, PassthroughRef, ResolvedRef)
  if (isMarkerRef(schemaOrRef)) {
    return markerToDescriptor(schemaOrRef);
  }

  // Handle Zod schemas via JSON Schema intermediary
  // This avoids depending on Zod internals
  return fromZodViaJsonSchema(schemaOrRef);
}

// ─────────────────────────────────────────────────────────────────────────────
// Marker Ref Detection
// ─────────────────────────────────────────────────────────────────────────────

interface MarkerRef {
  __type: 'generic' | 'passthrough' | 'resolved';
  __generic?: string;
  __passthrough?: string;
  __source?: string;
  __configField?: string;
}

function isMarkerRef(value: unknown): value is MarkerRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__type' in value &&
    typeof (value as MarkerRef).__type === 'string' &&
    ['generic', 'passthrough', 'resolved'].includes((value as MarkerRef).__type)
  );
}

function markerToDescriptor(ref: MarkerRef): TypeDescriptor {
  switch (ref.__type) {
    case 'generic':
      return { kind: 'generic', typeVar: ref.__generic ?? 'T' };
    case 'passthrough':
      return { kind: 'passthrough', sourcePortId: ref.__passthrough ?? '' };
    case 'resolved':
      return { kind: 'resolved', source: ref.__source ?? '', configField: ref.__configField ?? '' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Zod → TypeDescriptor (via JSON Schema)
// ─────────────────────────────────────────────────────────────────────────────

function fromZodViaJsonSchema(schema: unknown): TypeDescriptor {
  try {
    // Try using Zod's built-in toJSONSchema (Zod v4+)
    const zod = getZodModule(schema);
    if (zod?.toJSONSchema) {
      const jsonSchema = zod.toJSONSchema(schema, { unrepresentable: 'any' }) as Record<
        string,
        unknown
      >;
      return fromJsonSchema(jsonSchema);
    }
  } catch {
    // Fall through to constructor-based detection
  }

  // Fallback: detect type from Zod constructor name
  return fromZodConstructor(schema);
}

/**
 * Try to get the Zod module from a schema instance.
 * Avoids a direct import of Zod so this package stays dependency-free.
 */
function getZodModule(
  schema: unknown
): { toJSONSchema: (s: unknown, opts: Record<string, unknown>) => unknown } | null {
  try {
    // Zod v4 schemas have a registry reference
    const s = schema as { constructor?: { name?: string }; '~standard'?: unknown };
    if (s.constructor?.name?.startsWith('Zod') || s['~standard']) {
      // Dynamic import would be async, so we use a direct approach:
      // The caller should have Zod in scope when using this function
      // We look for toJSONSchema on the Zod namespace
      const zod = (globalThis as Record<string, unknown>).__brika_zod as
        | { toJSONSchema: (s: unknown, opts: Record<string, unknown>) => unknown }
        | undefined;
      return zod ?? null;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Convert a JSON Schema to TypeDescriptor.
 * This is the primary conversion path and handles the full JSON Schema spec subset we use.
 */
export function fromJsonSchema(schema: Record<string, unknown>): TypeDescriptor {
  const composite = fromCompositeSchema(schema);
  if (composite) {
    return composite;
  }

  const type = schema.type as string | undefined;
  switch (type) {
    case 'string':
      return { kind: 'primitive', type: 'string' };
    case 'number':
    case 'integer':
      return { kind: 'primitive', type: 'number' };
    case 'boolean':
      return { kind: 'primitive', type: 'boolean' };
    case 'null':
      return { kind: 'primitive', type: 'null' };
    case 'array':
      return fromArraySchema(schema);
    case 'object':
      return fromObjectSchema(schema);
    default:
      return { kind: 'unknown' };
  }
}

function fromCompositeSchema(schema: Record<string, unknown>): TypeDescriptor | null {
  if (schema.anyOf) {
    const variants = (schema.anyOf as Record<string, unknown>[]).map(fromJsonSchema);
    return variants.length === 1 && variants[0] ? variants[0] : { kind: 'union', variants };
  }
  if (schema.oneOf) {
    const variants = (schema.oneOf as Record<string, unknown>[]).map(fromJsonSchema);
    return variants.length === 1 && variants[0] ? variants[0] : { kind: 'union', variants };
  }
  if (schema.enum) {
    return { kind: 'enum', values: schema.enum as (string | number)[] };
  }
  if ('const' in schema) {
    return { kind: 'literal', value: schema.const as string | number | boolean };
  }
  return null;
}

function fromArraySchema(schema: Record<string, unknown>): TypeDescriptor {
  if (schema.items) {
    return { kind: 'array', element: fromJsonSchema(schema.items as Record<string, unknown>) };
  }
  if (schema.prefixItems) {
    const elements = (schema.prefixItems as Record<string, unknown>[]).map(fromJsonSchema);
    return { kind: 'tuple', elements };
  }
  return { kind: 'array', element: { kind: 'unknown' } };
}

function fromObjectSchema(schema: Record<string, unknown>): TypeDescriptor {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) {
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      return {
        kind: 'record',
        value: fromJsonSchema(schema.additionalProperties as Record<string, unknown>),
      };
    }
    return { kind: 'record', value: { kind: 'unknown' } };
  }

  const required = new Set((schema.required as string[] | undefined) ?? []);
  const fields: Record<string, { type: TypeDescriptor; optional: boolean }> = {};
  for (const [key, propSchema] of Object.entries(properties)) {
    fields[key] = {
      type: fromJsonSchema(propSchema),
      optional: !required.has(key),
    };
  }
  return { kind: 'object', fields };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback: Constructor-based detection
// ─────────────────────────────────────────────────────────────────────────────

const ZOD_PRIMITIVE_MAP: Record<string, TypeDescriptor> = {
  string: { kind: 'primitive', type: 'string' },
  number: { kind: 'primitive', type: 'number' },
  boolean: { kind: 'primitive', type: 'boolean' },
  null: { kind: 'primitive', type: 'null' },
  any: { kind: 'any' },
  unknown: { kind: 'unknown' },
  undefined: { kind: 'unknown' },
  record: { kind: 'record', value: { kind: 'unknown' } },
};

function fromZodConstructor(schema: unknown): TypeDescriptor {
  const name = getZodTypeName(schema);

  const primitive = ZOD_PRIMITIVE_MAP[name];
  if (primitive) {
    return primitive;
  }

  switch (name) {
    case 'array':
      return fromZodArray(schema);
    case 'object':
      return fromZodObject(schema);
    case 'optional':
    case 'nullable':
      return fromZodConstructor(getInner(schema));
    case 'union':
      return fromZodUnion(schema);
    case 'enum':
      return fromZodEnum(schema);
    default:
      return { kind: 'unknown' };
  }
}

function fromZodArray(schema: unknown): TypeDescriptor {
  const def = getDef(schema);
  const element = def?.element ?? def?.type;
  return {
    kind: 'array',
    element: element ? fromZodConstructor(element) : { kind: 'unknown' },
  };
}

function fromZodObject(schema: unknown): TypeDescriptor {
  const def = getDef(schema);
  const shape = def?.shape;
  if (!shape || typeof shape !== 'object') {
    return { kind: 'record', value: { kind: 'unknown' } };
  }

  const fields: Record<string, { type: TypeDescriptor; optional: boolean }> = {};
  for (const [key, fieldSchema] of Object.entries(shape as Record<string, unknown>)) {
    const fieldName = getZodTypeName(fieldSchema);
    fields[key] = {
      type: fromZodConstructor(fieldName === 'optional' ? getInner(fieldSchema) : fieldSchema),
      optional: fieldName === 'optional',
    };
  }
  return { kind: 'object', fields };
}

function fromZodUnion(schema: unknown): TypeDescriptor {
  const options = getDef(schema)?.options as unknown[] | undefined;
  if (options) {
    return { kind: 'union', variants: options.map(fromZodConstructor) };
  }
  return { kind: 'unknown' };
}

function fromZodEnum(schema: unknown): TypeDescriptor {
  const def = getDef(schema);
  const values = def?.entries ?? def?.values;
  if (Array.isArray(values)) {
    return { kind: 'enum', values: values as (string | number)[] };
  }
  return { kind: 'unknown' };
}

function getZodTypeName(schema: unknown): string {
  const s = schema as { constructor?: { name?: string } };
  const name = s?.constructor?.name;
  if (name?.startsWith('Zod')) {
    return name.slice(3).toLowerCase();
  }
  return 'unknown';
}

function getDef(schema: unknown): Record<string, unknown> | null {
  const s = schema as { _def?: Record<string, unknown> };
  return s?._def ?? null;
}

function getInner(schema: unknown): unknown {
  const def = getDef(schema);
  return def?.innerType ?? def?.unwrapped ?? schema;
}
