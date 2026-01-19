/**
 * Sparks Contract
 *
 * Typed event registration and emission
 */

import { z } from 'zod';
import { message } from '../define';
import { Json, JsonRecord } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const SparkDefinition = z.object({
  /** Local spark ID (without plugin prefix) */
  id: z.string(),
  /** JSON Schema for payload validation */
  schema: JsonRecord.optional(),
});
export type SparkDefinition = z.infer<typeof SparkDefinition>;

export const SparkEvent = z.object({
  /** Full spark type (pluginId:sparkId) */
  type: z.string(),
  /** Event payload */
  payload: Json,
  /** Source plugin that emitted */
  source: z.string(),
  /** Timestamp */
  ts: z.number(),
  /** Unique event ID */
  id: z.string(),
});
export type SparkEvent = z.infer<typeof SparkEvent>;

// ─────────────────────────────────────────────────────────────────────────────
// Messages
// ─────────────────────────────────────────────────────────────────────────────

/** Plugin registers a spark type with the hub */
export const registerSpark = message(
  'registerSpark',
  z.object({
    spark: SparkDefinition,
  })
);

/** Plugin emits a spark event */
export const emitSpark = message(
  'emitSpark',
  z.object({
    /** Local spark ID (without plugin prefix) */
    sparkId: z.string(),
    /** Event payload */
    payload: Json,
  })
);

/** Plugin subscribes to a spark type */
export const subscribeSpark = message(
  'subscribeSpark',
  z.object({
    /** Full spark type to subscribe to (pluginId:sparkId) */
    sparkType: z.string(),
    /** Unique subscription ID (for unsubscribe) */
    subscriptionId: z.string(),
  })
);

/** Plugin unsubscribes from a spark type */
export const unsubscribeSpark = message(
  'unsubscribeSpark',
  z.object({
    /** Subscription ID to remove */
    subscriptionId: z.string(),
  })
);

/** Hub delivers a spark event to a subscribed plugin */
export const sparkEvent = message(
  'sparkEvent',
  z.object({
    /** Subscription ID this event is for */
    subscriptionId: z.string(),
    /** The spark event */
    event: SparkEvent,
  })
);
