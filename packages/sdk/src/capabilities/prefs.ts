/**
 * Preferences capability specs.
 *
 * The preferences surface is mostly *local* — `getPreferences()`,
 * `onPreferencesChange()`, `onInit()`, `onUninstall()` all live inside the
 * plugin process. The hub pushes preference state to the plugin via the
 * existing `preferences` message; those are not capabilities.
 *
 * The single plugin-initiated capability is `prefs.set` — the plugin asks
 * the hub to persist a value. `definePreferenceOptions` is also conceptually
 * a registration but it's a RECEIVE-side concern (the hub later calls the
 * plugin's provider via the `preferenceOptions` RPC), so it stays on the
 * legacy IPC path like routes/actions invocation.
 */

import { defineCapability } from '@brika/capabilities';
import { z } from 'zod';

/** Plugin updates one of its own preference values. */
export const prefsSet = defineCapability(
  {
    id: 'dev.brika.prefs.set',
    ctxPath: 'prefs.set',
    args: z.object({ key: z.string(), value: z.unknown() }),
    result: z.object({}),
    description: 'Persist a plugin preference value to the hub',
  },
  () => {
    throw new Error(
      'prefs.set handler is not registered. The hub must register a handler before plugin code can call ctx.prefs.set().'
    );
  }
);

// ─── Ctx augmentation ────────────────────────────────────────────────────────

declare module '../ctx' {
  interface Ctx {
    prefs: {
      /**
       * Persist a plugin preference value. The hub writes through to brika.yml
       * (or the appropriate secret backend when the key carries the
       * `__secret_*` sentinel).
       */
      set(args: { key: string; value: unknown }): Promise<Record<string, never>>;
    };
  }
}
