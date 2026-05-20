/**
 * Hub-side handler for the `prefs.set` capability.
 *
 * Wraps the existing `onUpdatePreference` callback that the legacy
 * `updatePreference` message already wires. Both paths feed the same hub
 * state, so a plugin can use either during the migration window.
 */

import { defineCapability } from '@brika/capabilities';
import { prefsSet as spec } from '@brika/sdk/capabilities';

export interface PrefsCallbacks {
  setPreference(key: string, value: unknown): void;
}

export function buildPrefsCapabilities(cb: PrefsCallbacks) {
  return [
    defineCapability(spec.spec, (_ctx, { key, value }) => {
      cb.setPreference(key, value);
      return {};
    }),
  ];
}
