import { getContext } from '../context';

/**
 * Read a plugin-level (global) preference value.
 * Falls back to `defaultValue` when the key is missing.
 */
export function usePluginPreference<T>(name: string, defaultValue: T): T {
  const val = getContext().getPreferences()[name];
  return (val === undefined ? defaultValue : val) as T;
}
