/**
 * Events Contract
 *
 * Logging and heartbeat
 */

import { z } from 'zod';
import { message, rpc } from '../define';
import { JsonRecord } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const LogLevel = z.enum(['debug', 'info', 'warn', 'error']);
export type LogLevel = z.infer<typeof LogLevel>;

// ─────────────────────────────────────────────────────────────────────────────
// Messages & RPCs
// ─────────────────────────────────────────────────────────────────────────────

/** Send a log message */
export const log = message(
  'log',
  z.object({
    level: LogLevel,
    message: z.string(),
    meta: JsonRecord.optional(),
  })
);

/** Ping for heartbeat */
export const ping = rpc(
  'ping',
  z.object({
    ts: z.number(),
  }),
  z.object({
    ts: z.number(),
  })
);
