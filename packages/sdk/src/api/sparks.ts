/**
 * Spark API
 *
 * Define and emit typed events (sparks) across the BRIKA hub.
 */

import type { Source } from '@brika/flow';
import type { z } from 'zod';
import { zodToJsonSchema } from '../blocks/reactive';
import { getContext } from '../context';
import { collectSpark, type SparkMeta } from '../internal/collect';
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
 * Define a typed spark (event) with Zod schema validation. `brika build`
 * discovers sparks from source and lowers `meta` into the manifest `sparks[]`
 * array; do not hand-edit that array.
 *
 * @param spec The spark definition.
 * @param spec.id Stable event id (persistent across restarts).
 * @param spec.meta Optional display metadata (name, description) for the manifest.
 * @param spec.schema Zod schema validating every emitted payload.
 * @returns A {@link CompiledSpark} with a typed `emit`.
 * @example
 * ```typescript
 * import { defineSpark, z } from "@brika/sdk";
 *
 * export const switchPressed = defineSpark({
 *   id: "pressed",
 *   meta: { name: "Switch Pressed" },
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
  /** Display metadata lowered into the manifest `sparks[]` entry by `brika build`. */
  meta?: SparkMeta;
  schema: TSchema;
}): CompiledSpark<TSchema> {
  // Capture id + display metadata for `brika build`. No-op at plugin runtime.
  collectSpark({ id: spec.id, meta: spec.meta });

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
 * export const sparkReceiver = defineBlock({
 *   id: 'spark-receiver',
 *   meta: { name: 'Spark Receiver', category: 'trigger' },
 *   outputs: {
 *     out: output(z.resolved('spark', 'sparkType'), { name: 'Payload' }),
 *   },
 *   config: z.object({
 *     sparkType: z.sparkType('Spark type to listen for'),
 *   }),
 *   run({ config, outputs, start }) {
 *     // Subscribe to sparks and emit payload to output
 *     start(subscribeSpark(config.sparkType))
 *       .pipe(map(event => event.payload))
 *       .to(outputs.out);
 *   },
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
