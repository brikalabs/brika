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
