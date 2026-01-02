/**
 * Events Contract
 *
 * Event emission, subscription, logging, heartbeat
 */

import { z } from "zod";
import { message, rpc } from "../define";
import { Json, JsonRecord } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const LogLevel = z.enum(["debug", "info", "warn", "error"]);
export type LogLevel = z.infer<typeof LogLevel>;

export const EventPayload = z.object({
  id: z.string(),
  type: z.string(),
  source: z.string(),
  payload: Json,
  ts: z.number(),
});
export type EventPayload = z.infer<typeof EventPayload>;

// ─────────────────────────────────────────────────────────────────────────────
// Messages & RPCs
// ─────────────────────────────────────────────────────────────────────────────

/** Send a log message */
export const log = message(
  "log",
  z.object({
    level: LogLevel,
    message: z.string(),
    meta: JsonRecord.optional(),
  }),
);

/** Emit an event */
export const emit = message(
  "emit",
  z.object({
    eventType: z.string(),
    payload: Json,
  }),
);

/** Subscribe to event patterns */
export const subscribe = message(
  "subscribe",
  z.object({
    patterns: z.array(z.string()),
  }),
);

/** Unsubscribe from event patterns */
export const unsubscribe = message(
  "unsubscribe",
  z.object({
    patterns: z.array(z.string()),
  }),
);

/** Event delivered to subscriber */
export const event = message(
  "event",
  z.object({
    event: EventPayload,
  }),
);

/** Ping for heartbeat */
export const ping = rpc(
  "ping",
  z.object({
    ts: z.number(),
  }),
  z.object({
    ts: z.number(),
  }),
);
