/**
 * Lifecycle Contract
 *
 * Plugin lifecycle: hello, ready, stop, fatal
 */

import { z } from 'zod';
import { message } from '../define';

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const PluginRequirements = z.object({
  hub: z.string().optional(),
  sdk: z.string().optional(),
});
export type PluginRequirements = z.infer<typeof PluginRequirements>;

export const PluginInfo = z.object({
  id: z.string(),
  version: z.string(),
  requires: PluginRequirements.optional(),
});
export type PluginInfo = z.infer<typeof PluginInfo>;

// ─────────────────────────────────────────────────────────────────────────────
// Messages
// ─────────────────────────────────────────────────────────────────────────────

/** Plugin announces itself to hub */
export const hello = message(
  'hello',
  z.object({
    plugin: PluginInfo,
  })
);

/** Plugin is ready to receive messages */
export const ready = message('ready', z.object({}));

/** Hub tells plugin to shut down */
export const stop = message('stop', z.object({}));

/** Hub tells plugin it's being uninstalled (for cleanup) */
export const uninstall = message('uninstall', z.object({}));

/** Fatal error occurred */
export const fatal = message(
  'fatal',
  z.object({
    error: z.string(),
  })
);

/** Hub sends preferences to plugin (on startup + on change) */
export const preferences = message(
  'preferences',
  z.object({
    values: z.record(z.string(), z.unknown()),
  })
);
