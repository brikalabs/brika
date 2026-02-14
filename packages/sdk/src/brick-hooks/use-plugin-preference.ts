import { getContext } from '../context';

/**
 * Read a plugin-level (global) preference value.
 * Falls back to `defaultValue` when the key is missing.
 */
export function usePluginPreference<T>(name: string, defaultValue: T): T {
  const preferences = getContext().getPreferences();
  const val = preferences[name];
  return (val === undefined ? defaultValue : val) as T;
}
