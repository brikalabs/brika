/**
 * Special Schema Types
 *
 * These Zod helpers create schemas with special type markers in their description
 * that the UI can detect to render appropriate input components.
 *
 * The marker format is: $type:<typename>
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Type Markers
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_PREFIX = '$type:';

export const TypeMarker = {
  TOOL_REF: `${TYPE_PREFIX}toolRef`,
  COLOR: `${TYPE_PREFIX}color`,
  DURATION: `${TYPE_PREFIX}duration`,
  EXPRESSION: `${TYPE_PREFIX}expression`,
  CODE: `${TYPE_PREFIX}code`,
  SECRET: `${TYPE_PREFIX}secret`,
  FILE_PATH: `${TYPE_PREFIX}filePath`,
  URL: `${TYPE_PREFIX}url`,
  JSON: `${TYPE_PREFIX}json`,
} as const;

export type TypeMarkerValue = (typeof TypeMarker)[keyof typeof TypeMarker];

/**
 * Check if a JSON Schema description contains a type marker.
 */
export function getTypeMarker(description?: string): TypeMarkerValue | null {
  if (!description) return null;
  for (const marker of Object.values(TypeMarker)) {
    if (description.includes(marker)) {
      return marker as TypeMarkerValue;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Reference
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tool ID reference.
 *
 * The UI will render a tool picker that allows selecting a tool and will
 * automatically fetch the tool's schema for configuration.
 *
 * @param description Optional additional description (will be appended)
 */
export function toolRef(description?: string) {
  const desc = description ? `${TypeMarker.TOOL_REF} ${description}` : TypeMarker.TOOL_REF;
  return z.string().describe(desc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Color
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hex color value.
 *
 * The UI will render a color picker.
 *
 * @param description Optional additional description
 */
export function color(description?: string) {
  const desc = description ? `${TypeMarker.COLOR} ${description}` : TypeMarker.COLOR;
  return z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color')
    .describe(desc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Duration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Duration in milliseconds.
 *
 * The UI will render a duration input with unit selector (ms, s, m, h).
 *
 * @param options.min Minimum value in ms
 * @param options.max Maximum value in ms
 * @param description Optional additional description
 */
export function duration(options?: { min?: number; max?: number }, description?: string) {
  const desc = description ? `${TypeMarker.DURATION} ${description}` : TypeMarker.DURATION;
  let schema = z.number().int().min(0);
  if (options?.min !== undefined) schema = schema.min(options.min);
  if (options?.max !== undefined) schema = schema.max(options.max);
  return schema.describe(desc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Expression
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Expression string with variable interpolation.
 *
 * The UI will render an expression editor with variable autocomplete.
 * Variables are referenced as {{variableName}}.
 *
 * @param description Optional additional description
 */
export function expression(description?: string) {
  const desc = description ? `${TypeMarker.EXPRESSION} ${description}` : TypeMarker.EXPRESSION;
  return z.string().describe(desc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Code
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Code snippet.
 *
 * The UI will render a code editor with syntax highlighting.
 *
 * @param language Language for syntax highlighting (e.g. "javascript", "json")
 * @param description Optional additional description
 */
export function code(language: string, description?: string) {
  const desc = description
    ? `${TypeMarker.CODE}:${language} ${description}`
    : `${TypeMarker.CODE}:${language}`;
  return z.string().describe(desc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Secret
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Secret value (password, API key, etc).
 *
 * The UI will render a password input with show/hide toggle.
 *
 * @param description Optional additional description
 */
export function secret(description?: string) {
  const desc = description ? `${TypeMarker.SECRET} ${description}` : TypeMarker.SECRET;
  return z.string().describe(desc);
}

// ─────────────────────────────────────────────────────────────────────────────
// File Path
// ─────────────────────────────────────────────────────────────────────────────

/**
 * File path.
 *
 * The UI will render a file picker or path input.
 *
 * @param description Optional additional description
 */
export function filePath(description?: string) {
  const desc = description ? `${TypeMarker.FILE_PATH} ${description}` : TypeMarker.FILE_PATH;
  return z.string().describe(desc);
}

// ─────────────────────────────────────────────────────────────────────────────
// URL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * URL value.
 *
 * The UI will render a URL input with validation.
 *
 * @param description Optional additional description
 */
export function urlSchema(description?: string) {
  const desc = description ? `${TypeMarker.URL} ${description}` : TypeMarker.URL;
  return z.string().url().describe(desc);
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON
// ─────────────────────────────────────────────────────────────────────────────

/**
 * JSON value.
 *
 * The UI will render a JSON editor with syntax highlighting and validation.
 *
 * @param description Optional additional description
 */
export function jsonSchema(description?: string) {
  const desc = description ? `${TypeMarker.JSON} ${description}` : TypeMarker.JSON;
  return z.string().describe(desc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Passthrough Port (Generic Type)
// ─────────────────────────────────────────────────────────────────────────────

const PASSTHROUGH_MARKER = '$passthrough';

/**
 * Type marker for passthrough ports.
 * Carries the input port ID at the type level for compile-time type inference.
 *
 * @template K The input port ID to inherit the type from
 */
export interface PassthroughRef<K extends string = string> {
  readonly __passthrough: K;
  readonly __type: 'passthrough';
  /** Runtime schema (z.unknown) for serialization - not used for type inference */
  readonly _schema: z.ZodUnknown;
}

/**
 * Passthrough port marker.
 *
 * Creates a typed reference that indicates this output should inherit its type
 * from the specified input port. The TypeScript compiler will infer the correct
 * type at compile time.
 *
 * @param sourcePortId The input port ID to inherit the type from
 *
 * @example
 * ```typescript
 * defineReactiveBlock({
 *   inputs: {
 *     in: input(z.number(), { name: 'in' }),
 *   },
 *   outputs: {
 *     // 'out' will have type Emitter<number> (inferred from 'in')
 *     out: output(passthrough('in'), { name: 'out' }),
 *   },
 *   config: z.object({}),
 * }, ({ inputs, outputs }) => {
 *   inputs.in.on((num) => {
 *     outputs.out.emit(num);      // ✓ Correctly typed as number
 *     outputs.out.emit("hello");  // ✗ Type error!
 *   });
 * });
 * ```
 */
export function passthrough<K extends string>(sourcePortId: K): PassthroughRef<K> {
  return {
    __passthrough: sourcePortId,
    __type: 'passthrough',
    _schema: z.unknown().describe(`${PASSTHROUGH_MARKER}:${sourcePortId}`),
  } as PassthroughRef<K>;
}

/**
 * Check if a value is a PassthroughRef.
 */
export function isPassthroughRef(value: unknown): value is PassthroughRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as PassthroughRef).__type === 'passthrough'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic Port (Dynamic Type Inference)
// ─────────────────────────────────────────────────────────────────────────────

const GENERIC_MARKER = '$generic';

/**
 * Type marker for generic ports.
 *
 * In TypeScript: resolves to `unknown` (the block code works with any type)
 * In UI: shows as "generic" until connected, then infers type from connections
 *
 * @template T Optional type variable name for grouping (e.g., 'T', 'TInput')
 */
export interface GenericRef<T extends string = 'T'> {
  readonly __generic: T;
  readonly __type: 'generic';
  /** Runtime schema for validation - accepts any value */
  readonly _schema: z.ZodUnknown;
}

/**
 * Generic port marker.
 *
 * Creates a port that accepts any type. The actual type will be inferred
 * dynamically in the UI when connections are made.
 *
 * Use this instead of z.unknown() for generic blocks that can work with any data.
 *
 * @param typeVar Optional type variable name (default: 'T'). Ports with the same
 *                typeVar are expected to have the same type at runtime.
 *
 * @example
 * ```typescript
 * defineReactiveBlock({
 *   inputs: {
 *     // Generic input - type inferred from what connects to it
 *     in: input(generic(), { name: 'in' }),
 *   },
 *   outputs: {
 *     // Passthrough - same type as 'in'
 *     out: output(passthrough('in'), { name: 'out' }),
 *   },
 *   config: z.object({}),
 * }, ({ inputs, outputs }) => {
 *   // In TypeScript, 'data' is unknown
 *   // In UI, type is inferred from connections
 *   inputs.in.on((data) => {
 *     outputs.out.emit(data);
 *   });
 * });
 * ```
 */
export function generic<T extends string = 'T'>(typeVar?: T): GenericRef<T> {
  const name = typeVar ?? ('T' as T);
  return {
    __generic: name,
    __type: 'generic',
    _schema: z.unknown().describe(`${GENERIC_MARKER}:${name}`),
  } as GenericRef<T>;
}

/**
 * Check if a value is a GenericRef.
 */
export function isGenericRef(value: unknown): value is GenericRef {
  return typeof value === 'object' && value !== null && (value as GenericRef).__type === 'generic';
}
