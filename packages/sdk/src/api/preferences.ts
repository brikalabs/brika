/**
 * Preferences API
 *
 * Access and react to plugin configuration changes.
 */

import { getContext } from '../context';

export type PreferencesChangeHandler<T = Record<string, unknown>> = (preferences: T) => void;

/**
 * Get plugin preferences (configuration) sent by the hub.
 *
 * @example
 * ```typescript
 * interface MyPrefs { apiKey: string; debug: boolean; }
 * const prefs = getPreferences<MyPrefs>();
 * log("info", `API Key: ${prefs.apiKey}`);
 * ```
 */
export function getPreferences<T extends Record<string, unknown> = Record<string, unknown>>(): T {
  return getContext().getPreferences<T>();
}

/**
 * Register a handler that runs when preferences are updated.
 *
 * @example
 * ```typescript
 * onPreferencesChange<MyPrefs>((prefs) => {
 *   log("info", "Preferences updated!", { debugMode: prefs.debugMode });
 * });
 * ```
 */
export function onPreferencesChange<T extends Record<string, unknown> = Record<string, unknown>>(
  handler: PreferencesChangeHandler<T>
): () => void {
  return getContext().onPreferencesChange(
    handler as PreferencesChangeHandler<Record<string, unknown>>
  );
}

/**
 * Update a single preference value.
 *
 * Sends the change to the hub so it's persisted and visible in the UI.
 *
 * @example
 * ```typescript
 * setPreference('defaultDevice', 'Living Room Speaker');
 * ```
 */
export function setPreference(key: string, value: unknown): void {
  getContext().updatePreference(key, value);
}

/**
 * Register a dynamic options provider for a preference.
 *
 * Used with `dynamic-dropdown` preferences — the hub calls this
 * when loading the config UI to populate options at runtime.
 *
 * @example
 * ```typescript
 * definePreferenceOptions('defaultDevice', async () => {
 *   const devices = await api.getDevices();
 *   return devices.map(d => ({ value: d.name, label: `${d.name} (${d.type})` }));
 * });
 * ```
 */
export function definePreferenceOptions(
  name: string,
  provider: () =>
    | Array<{ value: string; label: string }>
    | Promise<Array<{ value: string; label: string }>>
): void {
  getContext().definePreferenceOptions(name, provider);
}
