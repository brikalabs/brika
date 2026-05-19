/**
 * Preferences API
 *
 * Access and react to plugin configuration changes.
 */

import type { z } from 'zod';
import { getContext } from '../context';
import { InvalidInputError } from '../errors';

export type PreferencesChangeHandler<T = Record<string, unknown>> = (preferences: T) => void;

/**
 * Get plugin preferences (configuration) sent by the hub.
 *
 * Two forms:
 * - `getPreferences()` returns the raw object as `Record<string, unknown>`.
 * - `getPreferences(schema)` validates against a Zod schema and returns the typed value;
 *   throws `InvalidInputError` if the preferences do not match.
 *
 * @example Untyped (raw access)
 * ```typescript
 * const prefs = getPreferences();
 * log("info", `keys: ${Object.keys(prefs).join(', ')}`);
 * ```
 *
 * @example With Zod schema (validated + typed)
 * ```typescript
 * import { z } from "@brika/sdk";
 *
 * const prefsSchema = z.object({ apiKey: z.string(), debug: z.boolean() });
 * const prefs = getPreferences(prefsSchema);
 * log("info", `API Key: ${prefs.apiKey}`);
 * ```
 *
 * @throws {InvalidInputError} when `schema` is provided and validation fails.
 */
export function getPreferences(): Record<string, unknown>;
export function getPreferences<S extends z.ZodType>(schema: S): z.infer<S>;
export function getPreferences<S extends z.ZodType>(schema?: S): Record<string, unknown> | z.infer<S> {
  const raw = getContext().getPreferences();
  if (schema === undefined) {
    return raw;
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new InvalidInputError(formatZodIssue(result.error), 'preferences');
  }
  return result.data;
}

function formatZodIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return 'schema validation failed';
  }
  const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
  return `at "${path}": ${issue.message}`;
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
    | Array<{
        value: string;
        label: string;
      }>
    | Promise<
        Array<{
          value: string;
          label: string;
        }>
      >
): void {
  getContext().definePreferenceOptions(name, provider);
}
