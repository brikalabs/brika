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
 * Register a dynamic options provider for a `dynamic-dropdown` field. The hub
 * calls this when loading the config UI to populate options at runtime, for
 * plugin preferences, brick config, and workflow block config.
 *
 * The provider receives the caller's `params` (when supplied), so options can
 * depend on sibling field values, e.g. the model list for the chosen provider.
 * Each option may carry an optional `description` shown as a secondary line.
 *
 * @example
 * ```typescript
 * // Independent of other fields (devices for a Spotify account):
 * definePreferenceOptions('defaultDevice', async () => {
 *   const devices = await api.getDevices();
 *   return devices.map(d => ({ value: d.id, label: `${d.name} (${d.type})` }));
 * });
 *
 * // Scoped by a sibling field (models for the selected provider):
 * definePreferenceOptions('model', (params) => listModels(params));
 * ```
 */
export function definePreferenceOptions(
  name: string,
  provider: (params?: Record<string, unknown>) =>
    | Array<{
        value: string;
        label: string;
        description?: string;
      }>
    | Promise<
        Array<{
          value: string;
          label: string;
          description?: string;
        }>
      >
): void {
  getContext().definePreferenceOptions(name, provider);
}
