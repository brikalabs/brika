/**
 * Plugin event payload schemas shared across the hub ↔ UI boundary. Declared
 * here once so the hub's event definitions and the UI's SSE parsing validate
 * against the same shape instead of each re-declaring it.
 */

import { z } from 'zod';

/**
 * Build progress for a plugin's source, emitted while installing/enabling so the
 * UI can show compilation live over the `/api/stream/events` SSE. `start` opens a
 * run, one `progress` fires per build step (each client module kind plus the
 * server entry), and `done`/`error` close it.
 */
export const pluginCompilePayloadSchema = z.object({
  uid: z.string(),
  name: z.string(),
  phase: z.enum(['start', 'progress', 'done', 'error']),
  /** Build step a `progress` event reports: a module kind or `'server'`. */
  step: z.string().optional(),
  /** Modules compiled in this step. */
  modules: z.number().optional(),
  /** Shared chunks emitted in this step. */
  chunks: z.number().optional(),
  /** True when the step was served from cache rather than rebuilt. */
  cached: z.boolean().optional(),
  /** Wall-clock duration of the step (`progress`) or whole run (`done`). */
  durationMs: z.number().optional(),
  /** Human-readable detail, set on `error` (the failure message). */
  message: z.string().optional(),
});

/** A fully-parsed `plugin.compile` event payload. */
export type PluginCompilePayload = z.infer<typeof pluginCompilePayloadSchema>;
