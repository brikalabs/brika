/**
 * Custom Schema Module
 *
 * A curated subset of Zod plus BRIKA-specific types.
 * Use this instead of importing directly from 'zod' to ensure type safety.
 *
 * ❌ BANNED: unknown, any - Use generic() instead for dynamic types
 *
 * @example
 * ```ts
 * import { z } from '@brika/sdk';
 *
 * // Standard Zod types
 * z.string()
 * z.number()
 * z.object({ name: z.string() })
 *
 * // BRIKA custom types
 * z.generic()        // Dynamic type inferred from connections
 * z.passthrough('in') // Same type as input 'in'
 * z.expression()     // JavaScript expression
 * z.color()          // Color picker
 * z.duration()       // Duration in ms
 * z.toolRef()        // Tool reference
 * ```
 */

import { z as zod } from 'zod';
import {
  code,
  color,
  duration,
  expression,
  filePath,
  generic,
  jsonSchema,
  passthrough,
  resolved,
  secret,
  sparkType,
  urlSchema,
} from './schema-types';

// ─────────────────────────────────────────────────────────────────────────────
// Safe Zod Re-exports (NO unknown, NO any)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Custom schema module with safe types only.
 *
 * Includes:
 * - Standard Zod types (string, number, boolean, object, array, etc.)
 * - BRIKA custom types (generic, passthrough, expression, color, etc.)
 *
 * Does NOT include: unknown, any (use generic() for dynamic types)
 */
export const z = {
  // ═══════════════════════════════════════════════════════════════════════════
  // Primitives
  // ═══════════════════════════════════════════════════════════════════════════

  /** String schema */
  string: zod.string,

  /** Number schema */
  number: zod.number,

  /** Boolean schema */
  boolean: zod.boolean,

  /** BigInt schema */
  bigint: zod.bigint,

  /** Date schema */
  date: zod.date,

  /** Symbol schema */
  symbol: zod.symbol,

  /** Null schema */
  null: zod.null,

  /** Void schema */
  void: zod.void,

  /** NaN schema */
  nan: zod.nan,

  /** Never schema (no value is valid) */
  never: zod.never,

  // ═══════════════════════════════════════════════════════════════════════════
  // Literals & Enums
  // ═══════════════════════════════════════════════════════════════════════════

  /** Literal value schema */
  literal: zod.literal,

  /** Enum schema */
  enum: zod.enum,

  // ═══════════════════════════════════════════════════════════════════════════
  // Composites
  // ═══════════════════════════════════════════════════════════════════════════

  /** Object schema */
  object: zod.object,

  /** Array schema */
  array: zod.array,

  /** Tuple schema */
  tuple: zod.tuple,

  /** Record schema (string keys, typed values) */
  record: zod.record,

  /** Map schema */
  map: zod.map,

  /** Set schema */
  set: zod.set,

  // ═══════════════════════════════════════════════════════════════════════════
  // Unions & Intersections
  // ═══════════════════════════════════════════════════════════════════════════

  /** Union schema (OR) */
  union: zod.union,

  /** Discriminated union schema */
  discriminatedUnion: zod.discriminatedUnion,

  /** Intersection schema (AND) */
  intersection: zod.intersection,

  // ═══════════════════════════════════════════════════════════════════════════
  // Modifiers
  // ═══════════════════════════════════════════════════════════════════════════

  /** Optional schema */
  optional: zod.optional,

  /** Nullable schema */
  nullable: zod.nullable,

  /** Coerce values to type */
  coerce: zod.coerce,

  // ═══════════════════════════════════════════════════════════════════════════
  // Internal Use Only
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Any schema - for internal object schemas only.
   * Do NOT use for port definitions - use generic() or passthrough() instead.
   */
  any: zod.any,

  // ═══════════════════════════════════════════════════════════════════════════
  // Advanced
  // ═══════════════════════════════════════════════════════════════════════════

  /** Lazy schema for recursive types */
  lazy: zod.lazy,

  /** Promise schema */
  promise: zod.promise,

  /** Function schema */
  function: zod.function,

  /** Preprocess input before validation */
  preprocess: zod.preprocess,

  /** Branded types */
  brand: <T extends string>() => zod.string().brand<T>(),

  // ═══════════════════════════════════════════════════════════════════════════
  // BRIKA Custom Types
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Generic type - accepts any value.
   *
   * Use this instead of `unknown` or `any`.
   * In UI, type is inferred dynamically from connections.
   *
   * @param typeVar Optional type variable name (e.g., 'T', 'TInput')
   *
   * @example
   * ```ts
   * inputs: {
   *   in: input(z.generic(), { name: 'in' }),
   * }
   * ```
   */
  generic,

  /**
   * Passthrough type - inherits type from an input port.
   *
   * @param sourcePortId The input port ID to inherit type from
   *
   * @example
   * ```ts
   * outputs: {
   *   out: output(z.passthrough('in'), { name: 'out' }),
   * }
   * ```
   */
  passthrough,

  /**
   * JavaScript expression.
   * UI renders a code editor with expression syntax.
   */
  expression,

  /**
   * Color value (hex, rgb, hsl).
   * UI renders a color picker.
   */
  color,

  /**
   * Duration in milliseconds.
   * UI renders a duration input with unit selector.
   */
  duration,

  /**
   * Spark type reference.
   * UI renders a spark picker dropdown with available sparks.
   */
  sparkType,

  /**
   * Code snippet.
   * UI renders a code editor.
   *
   * @param language Optional language for syntax highlighting
   */
  code,

  /**
   * Secret value (password, API key).
   * UI renders a password input.
   */
  secret,

  /**
   * File path.
   * UI renders a file picker.
   */
  filePath,

  /**
   * URL.
   * UI renders a URL input with validation.
   */
  url: urlSchema,

  /**
   * Raw JSON schema.
   * For advanced use cases where Zod is not flexible enough.
   */
  jsonSchema,

  /**
   * Resolved type - type is resolved dynamically from external data.
   *
   * The type inference system will:
   * 1. Read the config field value to get the lookup key
   * 2. Look up the key in the specified data source
   * 3. Use the matched entry's schema as this port's type
   *
   * @param source Data source to look up (e.g., 'spark')
   * @param configField Config field containing the lookup key
   *
   * @example
   * ```ts
   * // Output type is resolved from the selected spark's schema
   * outputs: {
   *   out: output(z.resolved('spark', 'sparkType'), { name: 'Payload' }),
   * },
   * config: z.object({
   *   sparkType: z.string(),  // e.g., "timer:timer-started"
   * }),
   * ```
   */
  resolved,

  // ═══════════════════════════════════════════════════════════════════════════
  // Type Inference Utilities
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Infer the TypeScript type from a schema.
   *
   * @example
   * ```ts
   * const mySchema = z.object({ name: z.string() });
   * type MyType = z.infer<typeof mySchema>;
   * // { name: string }
   * ```
   */
  infer: undefined as unknown as zod.infer<zod.ZodType>,
} as const;

// Type for z.infer usage
export type ZodInfer<T extends zod.ZodType> = zod.infer<T>;

// Re-export Zod types for advanced use (but NOT the z object)
export type { ZodObject, ZodRawShape, ZodType } from 'zod';
