/**
 * Spark API
 *
 * Define and emit typed events (sparks) across the BRIKA hub.
 */

import type { Source } from '@brika/flow';
import type { z } from 'zod';
import { zodToJsonSchema } from '../blocks/reactive';
import { getContext } from '../context';
import type { Json, SparkEvent } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A compiled spark with emit function.
 * Use `defineSpark()` to create typed sparks.
 */
export interface CompiledSpark<T extends z.ZodType> {
  /** Spark identifier (local, without plugin prefix) */
  readonly id: string;
  /** Zod schema for payload validation */
  readonly schema: T;
  /** Emit this spark with a validated payload */
  emit(payload: z.infer<T>): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Define a typed spark (event) with Zod schema validation.
 * Sparks must be declared in package.json under the "sparks" array.
 *
 * @example
 * ```typescript
 * import { defineSpark, z } from "@brika/sdk";
 *
 * // Define a typed spark
 * export const switchPressed = defineSpark({
 *   id: "pressed",
 *   schema: z.object({
 *     switchId: z.string(),
 *     state: z.enum(["on", "off"]),
 *     timestamp: z.number(),
 *   }),
 * });
 *
 * // Emit the spark (fully typed!)
 * switchPressed.emit({
 *   switchId: "living-room-main",
 *   state: "on",
 *   timestamp: Date.now(),
 * });
 * ```
 */
export function defineSpark<TSchema extends z.ZodType>(spec: {
  id: string;
  schema: TSchema;
}): CompiledSpark<TSchema> {
  const spark: CompiledSpark<TSchema> = {
    id: spec.id,
    schema: spec.schema,
    emit(payload: z.infer<TSchema>): void {
      // Validate in dev mode
      if (process.env.NODE_ENV !== 'production') {
        const result = spec.schema.safeParse(payload);
        if (!result.success) {
          console.warn(`[spark:${spec.id}] Validation failed:`, result.error.message);
        }
      }
      getContext().emitSpark(spec.id, payload as Json);
    },
  };

  // Register with hub
  try {
    const jsonSchema = zodToJsonSchema(spec.schema);
    getContext().registerSpark({
      id: spec.id,
      schema: jsonSchema,
    });
  } catch {
    // Context may not be available during testing
  }

  return spark;
}

// ─────────────────────────────────────────────────────────────────────────────
// Spark Subscription
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subscribe to a spark type and receive events as a reactive Source.
 *
 * The subscription is automatically cleaned up when the flow is stopped,
 * making it safe to use with the block's cleanup system.
 *
 * @param sparkType Full spark type to subscribe to (e.g., "timer:timer-started")
 * @returns A Source that emits SparkEvent objects
 *
 * @example
 * ```typescript
 * export const sparkReceiver = defineReactiveBlock({
 *   id: 'spark-receiver',
 *   outputs: {
 *     out: output(z.resolved('spark', 'sparkType'), { name: 'Payload' }),
 *   },
 *   config: z.object({
 *     sparkType: z.sparkType('Spark type to listen for'),
 *   }),
 * }, ({ config, outputs, start }) => {
 *   // Subscribe to sparks and emit payload to output
 *   start(subscribeSpark(config.sparkType))
 *     .pipe(map(event => event.payload))
 *     .to(outputs.out);
 * });
 * ```
 */
export function subscribeSpark(sparkType: string): Source<SparkEvent> {
  return {
    __source: true,
    start: (emit) => {
      return getContext().subscribeSpark(sparkType, emit);
    },
  };
}
